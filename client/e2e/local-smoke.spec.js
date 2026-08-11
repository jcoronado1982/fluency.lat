import { expect, test } from '@playwright/test';

async function prepareDevGuest(page, request) {
    // El E2E valida contratos y carga de media existente. La generación/borrado
    // real usa proveedores externos y jamás debe mutar archivos durante el gate.
    for (const routePattern of [
        '**/api/synthesize-speech',
        '**/api/generate-image',
        '**/api/upload-image',
        '**/api/delete-image',
        '**/api/delete-audio',
    ]) {
        await page.route(routePattern, (route) => route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Proveedor externo aislado por el E2E local' }),
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

    await page.addInitScript(({ token, user }) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('auth_user', JSON.stringify({
            ...user,
            onboarding_completed: true,
        }));
    }, auth);
    await page.addInitScript(() => {
        const originalPlay = HTMLMediaElement.prototype.play;
        window.__localTestAudioPlayCalls = 0;
        HTMLMediaElement.prototype.play = function trackedPlay(...args) {
            window.__localTestAudioPlayCalls += 1;
            return originalPlay.apply(this, args);
        };
    });
    return auth;
}

test('health, features and dev-guest work through the local Vite proxy', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    expect(await health.json()).toMatchObject({ status: 'ok' });

    const features = await request.get('/api/features');
    expect(features.ok()).toBeTruthy();
    expect(await features.json()).toMatchObject({ flashcards: true, auth: true });

    const guest = await request.post('/api/auth/dev-guest');
    expect(guest.ok()).toBeTruthy();
    expect(await guest.json()).toMatchObject({ success: true });
});

test('landing guest media contracts resolve real versioned assets', async ({ request }) => {
    const image = await request.post('/api/resolve-image', {
        data: {
            category: 'landing-demo',
            deck: 'verbs-essentials',
            index: 1,
            def_index: 0,
            course_direction: 'es_en',
        },
    });
    expect(image.ok()).toBeTruthy();
    const imagePayload = await image.json();
    expect(imagePayload.path).toMatch(/\/card_images\/landing-demo\/.+\.avif\?v=.+/);
    const imageAsset = await request.get(imagePayload.path);
    expect(imageAsset.ok()).toBeTruthy();
    expect(imageAsset.headers()['content-type']).toMatch(/^image\//);

    const audio = await request.post('/api/resolve-audio', {
        data: {
            category: 'landing-demo',
            deck: 'verbs-essentials',
            text: 'be',
            voice_name: '',
            verb_name: 'be',
            tone: '',
            lang: 'en',
            course_direction: 'es_en',
        },
    });
    expect(audio.ok()).toBeTruthy();
    const audioPayload = await audio.json();
    expect(audioPayload).toMatchObject({
        voice_name: expect.any(String),
        from_cache: expect.any(Boolean),
    });
    expect(audioPayload.audio_url).toMatch(/\/card_audio\/landing-demo\/.+\?v=.+/);
    const audioAsset = await request.get(audioPayload.audio_url);
    expect(audioAsset.ok()).toBeTruthy();
    expect(audioAsset.headers()['content-type']).toMatch(/^audio\//);
});

test('a landing visitor can navigate the demo and preserve feedback through login', async ({ page }) => {
    const feedbackLoaded = page.waitForResponse((response) => (
        response.url().includes('/api/demo-feedback?limit=20')
        && response.request().method() === 'GET'
    ));
    await page.goto('/');
    expect((await feedbackLoaded).ok()).toBeTruthy();
    await expect(page.locator('.lp-hero-title')).toBeVisible();

    const counter = page.locator('[data-tour="boton-contador-tarjetas"]');
    await expect(counter).toContainText('1 / 10');
    await page.locator('[data-tour="boton-siguiente-tarjeta"]').click();
    await expect(counter).toContainText('2 / 10');
    await page.locator('[data-tour="boton-anterior-tarjeta"]').click();
    await expect(counter).toContainText('1 / 10');

    await page.locator('.lp-demo-feedback-input').fill('  The demo is clear  ');
    await page.locator('.lp-star-btn').nth(4).click();
    await page.locator('.lp-demo-feedback-submit').click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);

    const draft = await page.evaluate(() => JSON.parse(
        sessionStorage.getItem('lp-demo-feedback-draft'),
    ));
    expect(draft).toEqual({ comment: 'The demo is clear', rating: 5 });
    await expect.poll(() => page.evaluate(() => (
        sessionStorage.getItem('lp-demo-feedback-return')
    ))).toBe('1');
});

test('a dev guest restores an authenticated browser session', async ({ page, request }) => {
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));

    await prepareDevGuest(page, request);

    await page.goto('/dashboard');
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
    expect(browserErrors).toEqual([]);
});

test('versioned audio and image assets resolve and download locally', async ({ page, request }) => {
    const auth = await prepareDevGuest(page, request);
    const headers = { Authorization: `Bearer ${auth.token}` };

    const image = await request.post('/api/resolve-image', {
        headers,
        data: {
            category: 'verbs',
            deck: '1-basic/action.json',
            index: 0,
            def_index: 0,
            course_direction: 'es_en',
        },
    });
    expect(image.ok()).toBeTruthy();
    const imagePayload = await image.json();
    expect(imagePayload.path).toMatch(/\/card_images\/.+\?v=.+/);
    const imageAsset = await request.get(imagePayload.path);
    expect(imageAsset.ok()).toBeTruthy();
    expect(imageAsset.headers()['content-type']).toMatch(/^image\//);
    expect((await imageAsset.body()).length).toBeGreaterThan(100);

    const audio = await request.post('/api/resolve-audio', {
        headers,
        data: {
            category: 'verbs',
            deck: '1-basic/action.json',
            text: 'do',
            voice_name: '',
            verb_name: 'do',
            tone: '',
            lang: 'en',
            course_direction: 'es_en',
        },
    });
    expect(audio.ok()).toBeTruthy();
    const audioPayload = await audio.json();
    expect(audioPayload.audio_url).toMatch(/\/card_audio\/.+\?v=.+/);
    const audioAsset = await request.get(audioPayload.audio_url);
    expect(audioAsset.ok()).toBeTruthy();
    expect(audioAsset.headers()['content-type']).toMatch(/^audio\//);
    expect((await audioAsset.body()).length).toBeGreaterThan(100);
});

test('a user opens the catalog, flips a card and persists progress', async ({ page, request }) => {
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    await prepareDevGuest(page, request);
    await page.goto('/flashcard');

    const card = page.locator('[data-tour="boton-voltear-tarjeta"]');
    await page.getByRole('button', { name: /Study menu/i }).click();
    await page.getByRole('button', { name: /Categories Word collections/i }).click();

    const catalog = page.locator('[data-tour="catalogo-modal"]');
    await expect(catalog).toBeVisible({ timeout: 15_000 });
    const verbs = catalog.locator('[data-tour="categoria-item"][data-categoria="verbos"]');
    await verbs.click();
    await expect(verbs).toHaveAttribute('aria-current', 'true');
    await catalog.getByRole('button', { name: 'Basic', exact: true }).click();
    const actionDeck = catalog.getByRole('heading', { name: 'Action', exact: true }).locator('../..');
    await expect(actionDeck).toBeVisible({ timeout: 15_000 });
    await actionDeck.click();

    // dev-guest conserva progreso entre corridas. Reiniciar el bloque elegido
    // garantiza que el smoke siempre comienza con una tarjeta disponible.
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    const resetDialog = page.getByRole('alertdialog');
    await expect(resetDialog).toBeVisible();
    const resetSaved = page.waitForResponse((response) => (
        response.url().includes('/api/reset-all') && response.request().method() === 'POST'
    ));
    const deckReloaded = page.waitForResponse((response) => (
        response.url().includes('/api/flashcards-data') && response.request().method() === 'GET'
    ));
    await resetDialog.getByRole('button', { name: 'Reset', exact: true }).click();
    expect((await resetSaved).ok()).toBeTruthy();
    expect((await deckReloaded).ok()).toBeTruthy();

    await expect(card).toBeVisible({ timeout: 15_000 });
    const image = card.locator('img[src*="/card_images/"]').first();
    await expect(image).toBeAttached();
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
        .toBe(true);

    const counter = page.locator('[data-tour="boton-contador-tarjetas"]');
    await expect(counter).toContainText('1 /');
    await page.locator('[data-tour="boton-siguiente-tarjeta"]').click();
    await expect(counter).toContainText('2 /');
    await page.locator('[data-tour="boton-anterior-tarjeta"]').click();
    await expect(counter).toContainText('1 /');

    const audioButton = page.locator('[data-tour="boton-reproducir-audio-palabra"]').first();
    await audioButton.waitFor({ state: 'visible' });
    await expect(audioButton).toBeEnabled();
    // Esperar a que termine la resolución automática iniciada al cambiar de tarjeta;
    // así el gesto manual no compite con el autoplay que se está cancelando.
    await page.waitForTimeout(500);
    const playCallsBeforeClick = await page.evaluate(() => window.__localTestAudioPlayCalls);
    await audioButton.click();
    await expect.poll(() => page.evaluate(() => window.__localTestAudioPlayCalls))
        .toBeGreaterThan(playCallsBeforeClick);

    await expect(card).toHaveAttribute('data-flipped', 'false');
    // El centro geométrico cambia con el viewport y puede caer sobre audio/imagen.
    // El título es una superficie no interactiva cuyo toque se propaga a la tarjeta.
    await card.locator('h2').click();
    await expect(card).toHaveAttribute('data-flipped', 'true');

    const progressSaved = page.waitForResponse((response) => (
        response.url().includes('/api/update-batch') && response.request().method() === 'POST'
    ));
    await page.locator('[data-tour="boton-marcar-aprendida"]').click();
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    expect((await progressSaved).ok()).toBeTruthy();
    expect(browserErrors).toEqual([]);
});
