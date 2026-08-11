import { expect, test } from '@playwright/test';

test.setTimeout(60_000);

const MEDIA_MUTATIONS = [
    '**/api/synthesize-speech',
    '**/api/generate-image',
    '**/api/upload-image',
    '**/api/delete-image',
    '**/api/delete-audio',
];

const CATEGORY_SLUGS = {
    verbs: 'verbos',
    nouns: 'sustantivos',
    adjectives: 'adjetivos',
    phrasal_verbs: 'phrasal_verbs',
};

async function authenticateDevGuest(page, request, { language = 'en', studyLanguage = 'en' } = {}) {
    for (const routePattern of MEDIA_MUTATIONS) {
        await page.route(routePattern, (route) => route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'External media mutation isolated by E2E' }),
        }));
    }

    const guest = await request.post('/api/auth/dev-guest');
    expect(guest.ok()).toBeTruthy();
    const auth = await guest.json();
    const onboarding = await request.post('/api/auth/onboarding', {
        headers: { Authorization: `Bearer ${auth.token}` },
        data: { completed: true },
    });
    expect(onboarding.ok()).toBeTruthy();
    const languageSaved = await request.post('/api/auth/study-language', {
        headers: { Authorization: `Bearer ${auth.token}` },
        data: { study_language: studyLanguage },
    });
    expect(languageSaved.ok()).toBeTruthy();

    await page.addInitScript(({ token, user, language: interfaceLanguage, studyLanguage: targetLanguage }) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify({ ...user, onboarding_completed: true }));
        if (!localStorage.getItem('interface_language')) {
            localStorage.setItem('interface_language', interfaceLanguage);
        }
        if (!localStorage.getItem('study_language')) {
            localStorage.setItem('study_language', targetLanguage);
        }
        window.__e2eAudioPlayCalls = 0;
        HTMLMediaElement.prototype.play = function trackedPlay() {
            window.__e2eAudioPlayCalls += 1;
            return Promise.resolve();
        };
    }, { ...auth, language, studyLanguage });

    return auth;
}

async function openStudyMenu(page, language = 'en') {
    const label = language === 'es' ? 'Menú de estudio' : 'Study menu';
    const trigger = page.getByRole('button', { name: label }).last();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    return trigger;
}

async function openCatalog(page, language = 'en') {
    await openStudyMenu(page, language);
    const option = language === 'es'
        ? page.getByRole('button', { name: /Categorías.*Colecciones de palabras/i })
        : page.getByRole('button', { name: /Categories.*Word collections/i });
    await option.click();
    const catalog = page.locator('[data-tour="catalogo-modal"]');
    await expect(catalog).toBeVisible({ timeout: 15_000 });
    return catalog;
}

async function changeInterfaceLanguage(page, { from, to, isMobile }) {
    const fromGroup = from === 'es' ? 'Idioma de la interfaz' : 'Interface language';
    const toGroup = to === 'es' ? 'Idioma de la interfaz' : 'Interface language';
    const openAccount = from === 'es' ? 'Abrir menú de cuenta' : 'Open account menu';

    if (isMobile) {
        const currentStudyMenu = page.getByRole('button', {
            name: from === 'es' ? 'Menú de estudio' : 'Study menu',
            exact: true,
        }).last();
        if (await currentStudyMenu.getAttribute('aria-expanded') !== 'true') {
            await page.getByRole('button', { name: openAccount, exact: true }).click();
        }
        await expect(currentStudyMenu).toHaveAttribute('aria-expanded', 'true');
    }

    const selector = page.getByRole('group', { name: fromGroup });
    await expect(selector).toBeVisible();
    await selector.getByRole('button', { name: to.toUpperCase(), exact: true }).click();
    await expect(page.getByRole('group', { name: toGroup })).toBeVisible();

    if (isMobile) {
        const studyMenu = page.getByRole('button', {
            name: to === 'es' ? 'Menú de estudio' : 'Study menu',
            exact: true,
        }).last();
        await studyMenu.click();
        await expect(studyMenu).toHaveAttribute('aria-expanded', 'false');
    }
}

async function chooseNestedDeck(page, { category, level, deckLabel, language = 'en' }) {
    const catalog = await openCatalog(page, language);
    const categorySlug = CATEGORY_SLUGS[category] || category;
    const categoryButton = catalog.locator(`[data-tour="categoria-item"][data-categoria="${categorySlug}"]`);
    await categoryButton.click();
    await expect(categoryButton).toHaveAttribute('aria-current', 'true');

    await catalog.getByRole('button', { name: level, exact: true }).click();
    const deckHeading = catalog.getByRole('heading', { name: deckLabel, exact: true });
    await expect(deckHeading).toBeVisible({ timeout: 15_000 });
    const deck = deckHeading.locator('../..');
    await expect(deck).toBeVisible({ timeout: 15_000 });
    await deck.click();
    await expect(catalog).toBeHidden();
    await expect(page.locator('[data-tour="boton-voltear-tarjeta"]')).toBeVisible({ timeout: 15_000 });
}

async function resetCurrentDeck(page, language = 'en') {
    const resetLabel = language === 'es' ? 'Reiniciar' : 'Reset';
    await page.getByRole('button', { name: resetLabel, exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    const resetResponse = page.waitForResponse((response) => (
        response.url().includes('/api/reset-all') && response.request().method() === 'POST'
    ));
    await dialog.getByRole('button', { name: resetLabel, exact: true }).click();
    expect((await resetResponse).ok()).toBeTruthy();
    await expect(page.locator('[data-tour="boton-voltear-tarjeta"]')).toBeVisible({ timeout: 15_000 });
}

async function resetDeckViaApi(request, auth, category, deck, courseDirection = 'es_en') {
    const response = await request.post('/api/reset-all', {
        headers: { Authorization: `Bearer ${auth.token}` },
        data: {
            user_id: auth.user.email,
            category,
            deck,
            course_direction: courseDirection,
            scope: 'deck',
            confirm: true,
        },
    });
    expect(response.ok()).toBeTruthy();
}

async function markEveryRemainingCard(page) {
    const counter = page.locator('[data-tour="boton-contador-tarjetas"]');
    const initialText = await counter.textContent();
    const match = initialText?.match(/\d+\s*\/\s*(\d+)/);
    expect(match, `Unexpected counter: ${initialText}`).toBeTruthy();
    const total = Number(match[1]);
    expect(total).toBeGreaterThan(0);

    for (let index = 0; index < total; index += 1) {
        await page.locator('[data-tour="boton-marcar-aprendida"]').click();
    }
    return total;
}

test('login session, dashboard and both languages remain coherent during study', async ({ page, request, isMobile }) => {
    await authenticateDevGuest(page, request, { language: 'es', studyLanguage: 'en' });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('.dash-course-card')).toBeVisible({ timeout: 15_000 });

    await changeInterfaceLanguage(page, { from: 'es', to: 'en', isMobile });

    await openStudyMenu(page, 'en');
    const studyDirection = page.getByRole('group', { name: 'Study language' });
    const learnSpanish = studyDirection.getByRole('button', { name: 'English → Spanish' });
    const languageSaved = page.waitForResponse((response) => (
        response.url().includes('/api/auth/study-language')
        && response.request().method() === 'POST'
    ));
    await learnSpanish.click();
    expect((await languageSaved).ok()).toBeTruthy();
    await expect(learnSpanish).toHaveAttribute('aria-pressed', 'true');

    const spanishCatalog = page.waitForResponse((response) => (
        response.url().includes('/api/categories')
        && response.url().includes('course_direction=en_es')
    ));
    await page.goto('/flashcard');
    expect((await spanishCatalog).ok()).toBeTruthy();
    await expect(page.locator('[data-tour="boton-voltear-tarjeta"]')).toBeVisible({ timeout: 15_000 });

    await openStudyMenu(page, 'en');
    const learnEnglish = page.getByRole('group', { name: 'Study language' })
        .getByRole('button', { name: 'Spanish → English' });
    const englishCatalog = page.waitForResponse((response) => (
        response.url().includes('/api/categories')
        && response.url().includes('course_direction=es_en')
    ));
    await learnEnglish.click();
    expect((await englishCatalog).ok()).toBeTruthy();
    await expect(learnEnglish).toHaveAttribute('aria-pressed', 'true');

    await changeInterfaceLanguage(page, { from: 'en', to: 'es', isMobile });
    await expect(page.getByRole('button', { name: 'Menú de estudio' }).last()).toBeVisible();
    await expect(page.locator('[data-tour="boton-marcar-aprendida"]')).toBeVisible();
});

test('catalog supports close, help, several categories, levels and persisted ordering', async ({ page, request }) => {
    await authenticateDevGuest(page, request);
    await page.goto('/flashcard');
    let catalog = await openCatalog(page);

    await catalog.getByRole('button', { name: 'Category help' }).click();
    await expect(catalog.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(catalog.getByRole('dialog')).toBeHidden();

    for (const category of ['verbs', 'nouns', 'adjectives']) {
        const button = catalog.locator(
            `[data-tour="categoria-item"][data-categoria="${CATEGORY_SLUGS[category]}"]`,
        );
        await button.click();
        await expect(button).toHaveAttribute('aria-current', 'true');
        await expect(catalog.locator('[data-tour="catalogo-grid"]')).not.toBeEmpty();
    }

    const availableLevels = catalog.locator('[data-tour="catalogo-nivel"] button:not([disabled])');
    expect(await availableLevels.count()).toBeGreaterThanOrEqual(2);
    await availableLevels.nth(1).click();
    await expect(availableLevels.nth(1)).toHaveClass(/active/);

    const categories = catalog.locator('[data-tour="categoria-item"]');
    const firstBefore = await categories.first().getAttribute('data-categoria');
    const thirdBefore = await categories.nth(2).getAttribute('data-categoria');
    const preferenceSaved = page.waitForResponse((response) => (
        response.url().includes('/api/auth/catalog-preferences')
        && response.request().method() === 'POST'
    ));
    await categories.first().dragTo(categories.nth(2));
    expect((await preferenceSaved).ok()).toBeTruthy();
    await expect(categories.nth(2)).toHaveAttribute('data-categoria', firstBefore);
    await expect(categories.first()).not.toHaveAttribute('data-categoria', firstBefore);
    expect(thirdBefore).not.toBe(firstBefore);

    await catalog.locator('button').first().click();
    await expect(catalog).toBeHidden();
    catalog = await openCatalog(page);
    await expect(catalog.locator('[data-tour="categoria-item"]').nth(2))
        .toHaveAttribute('data-categoria', firstBefore);
});

test('card supports both flip directions, buttons, swipes, audio and several checks', async ({ page, request }) => {
    await authenticateDevGuest(page, request);
    await page.goto('/flashcard');
    await chooseNestedDeck(page, {
        category: 'verbs',
        level: 'Basic',
        deckLabel: 'Action',
    });
    await resetCurrentDeck(page);

    const card = page.locator('[data-tour="boton-voltear-tarjeta"]');
    await expect(card).toHaveAttribute('data-flipped', 'false');
    await card.locator('h2').click();
    await expect(card).toHaveAttribute('data-flipped', 'true');
    await card.click({ position: { x: 12, y: 12 } });
    await expect(card).toHaveAttribute('data-flipped', 'false');

    const counter = page.locator('[data-tour="boton-contador-tarjetas"]');
    await expect(counter).toContainText('1 / 32');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(counter).toContainText('2 / 32');
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(counter).toContainText('1 / 32');

    const mainArea = page.locator('.flashcard-main-area');
    await mainArea.dispatchEvent('touchstart', { targetTouches: [{ identifier: 1, clientX: 260 }] });
    await mainArea.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 80 }] });
    await expect(counter).toContainText('2 / 32');
    await mainArea.dispatchEvent('touchstart', { targetTouches: [{ identifier: 2, clientX: 80 }] });
    await mainArea.dispatchEvent('touchend', { changedTouches: [{ identifier: 2, clientX: 260 }] });
    await expect(counter).toContainText('1 / 32');

    const audio = page.locator('[data-tour="boton-reproducir-audio-palabra"]').first();
    await expect(audio).toBeEnabled();
    // El cambio de tarjeta dispara resolución/autoplay. Esperar a que termine
    // evita medir el clic manual mientras el autoplay anterior se cancela.
    await page.waitForTimeout(500);
    const callsBefore = await page.evaluate(() => window.__e2eAudioPlayCalls);
    await audio.click();
    await expect.poll(() => page.evaluate(() => window.__e2eAudioPlayCalls)).toBeGreaterThan(callsBefore);

    const batchSaved = page.waitForResponse((response) => (
        response.url().includes('/api/update-batch')
        && response.request().method() === 'POST'
    ));
    await page.locator('[data-tour="boton-marcar-aprendida"]').click();
    await page.locator('[data-tour="boton-marcar-aprendida"]').click();
    await expect(counter).toContainText('1 / 30');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    const batch = await batchSaved;
    expect(batch.ok()).toBeTruthy();
    expect(batch.request().postDataJSON().cards).toHaveLength(2);

    await page.goto('/dashboard');
    const dashboardCourse = page.locator('.dash-course-card');
    await expect(dashboardCourse).toBeVisible();
    if (await dashboardCourse.getByText('Daily review', { exact: true }).isVisible()) {
        await dashboardCourse.getByRole('button', { name: 'Next category' }).click();
    }
    await expect(dashboardCourse).toContainText(/Verbs/i);
    await expect(dashboardCourse).toContainText(/30 cards remaining/i);
});

test('reset cancel/confirm and complete a level with the correct confirmation', async ({ page, request }) => {
    const auth = await authenticateDevGuest(page, request);
    await resetDeckViaApi(request, auth, 'verbs', '1-basic/modal_auxiliaries.json');
    await page.goto('/flashcard');
    await chooseNestedDeck(page, {
        category: 'verbs',
        level: 'Basic',
        deckLabel: 'Modal Auxiliaries',
    });

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    let dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Cancel/i }).click();
    await expect(dialog).toBeHidden();

    await resetCurrentDeck(page);
    const total = await markEveryRemainingCard(page);
    expect(total).toBe(8);

    await expect(page.getByRole('heading', { name: 'Deck complete' })).toBeVisible();
    await expect(page.getByText('8/8', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.getByText('Recommended next step', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue path' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View categories' })).toBeVisible();

    await page.getByRole('button', { name: 'View categories' }).click();
    const catalog = page.locator('[data-tour="catalogo-modal"]');
    await expect(catalog).toBeVisible();
    const cards = catalog.locator('[data-tour="catalogo-grid"] > div');
    await expect(cards.last()).toContainText('Modal Auxiliaries');
    // Un mazo completo muestra el badge "✓ complete" en vez del conteo
    // (CategorySelector.jsx: `isComplete ? t.complete : `${learned} / ${total}``) —
    // el test decía "8 / 8", desactualizado igual que "Level complete" arriba.
    await expect(cards.last()).toContainText('✓ complete');
});

test('finishing the final category shows the end-of-route edge message', async ({ page, request }) => {
    const auth = await authenticateDevGuest(page, request);
    await resetDeckViaApi(request, auth, 'phrasal_verbs', '3-advanced/social_outcomes.json');
    await page.goto('/flashcard');
    await chooseNestedDeck(page, {
        category: 'phrasal_verbs',
        level: 'Advanced',
        deckLabel: 'Social Outcomes',
    });
    await resetCurrentDeck(page);
    const total = await markEveryRemainingCard(page);
    expect(total).toBe(6);

    await expect(page.getByRole('heading', { name: 'Deck complete' })).toBeVisible();
    await expect(page.getByText('6/6', { exact: true })).toBeVisible();
    await expect(page.getByText(
        'You already completed the available route. You can review a category or explore another one.',
        { exact: true },
    )).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue path' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View categories' })).toHaveCount(1);
});

test('two different users never receive each other progress', async ({ page, request }) => {
    const auth = await authenticateDevGuest(page, request);
    const headers = { Authorization: `Bearer ${auth.token}` };
    const category = 'verbs';
    const deck = '1-basic/modal_auxiliaries.json';
    const courseDirection = 'es_en';
    const userA = 'e2e-isolation-a@fluency.local';
    const userB = 'e2e-isolation-b@fluency.local';

    for (const userId of [userA, userB]) {
        const reset = await request.post('/api/reset-all', {
            headers,
            data: {
                user_id: userId,
                category,
                deck,
                course_direction: courseDirection,
                scope: 'deck',
                confirm: true,
            },
        });
        expect(reset.ok()).toBeTruthy();
    }

    const savedA = await request.post('/api/update-batch', {
        headers,
        data: {
            user_id: userA,
            category,
            deck,
            course_direction: courseDirection,
            cards: [{ index: 0, learned: true }],
        },
    });
    expect(savedA.ok()).toBeTruthy();

    const readDeck = async (userId) => {
        const response = await request.get('/api/flashcards-data', {
            headers,
            params: {
                user_id: userId,
                category,
                deck,
                course_direction: courseDirection,
            },
        });
        expect(response.ok()).toBeTruthy();
        return response.json();
    };

    let cardsA = await readDeck(userA);
    let cardsB = await readDeck(userB);
    expect(cardsA[0].learned).toBe(true);
    expect(cardsA[1].learned).toBe(false);
    expect(cardsB[0].learned).toBe(false);
    expect(cardsB[1].learned).toBe(false);

    const savedB = await request.post('/api/update-batch', {
        headers,
        data: {
            user_id: userB,
            category,
            deck,
            course_direction: courseDirection,
            cards: [{ index: 1, learned: true }],
        },
    });
    expect(savedB.ok()).toBeTruthy();

    cardsA = await readDeck(userA);
    cardsB = await readDeck(userB);
    expect(cardsA[0].learned).toBe(true);
    expect(cardsA[1].learned).toBe(false);
    expect(cardsB[0].learned).toBe(false);
    expect(cardsB[1].learned).toBe(true);
});
