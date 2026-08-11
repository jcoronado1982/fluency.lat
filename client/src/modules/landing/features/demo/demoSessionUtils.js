import rawCards from '../../data/demoCards.json';
import {
    LANDING_DEMO_CARD_LIMIT,
    buildLandingDemoImagePath,
} from '../../../../contracts/landingDemoNamespace';

function ensureDemoImagePaths(definitions, demoIndex, form = 'v1') {
    return (definitions || []).map((def, defIndex) => ({
        ...def,
        imagePath: def.imagePath ?? buildLandingDemoImagePath(demoIndex, defIndex, form),
    }));
}

export function prepareDemoCards(raw) {
    return raw.map((card, idx) => {
        const demoIndex = card.demoIndex ?? idx + 1;
        const definitions = ensureDemoImagePaths(card.definitions, demoIndex, 'v1');

        let irregular = card.irregular;
        if (irregular?.past?.definitions) {
            irregular = {
                ...irregular,
                past: {
                    ...irregular.past,
                    definitions: ensureDemoImagePaths(irregular.past.definitions, demoIndex, 'v2'),
                },
            };
        }
        if (irregular?.participle?.definitions) {
            irregular = {
                ...irregular,
                participle: {
                    ...irregular.participle,
                    definitions: ensureDemoImagePaths(irregular.participle.definitions, demoIndex, 'v3'),
                },
            };
        }

        return {
            ...card,
            id: demoIndex,
            demoIndex,
            definitions,
            irregular,
            learned: false,
            learned_at: null,
        };
    });
}

/**
 * Crea una copia fresca del deck demo para la sesión actual del visitante.
 * No toca DB ni comparte estado aprendido entre usuarios.
 */
export function createDemoSessionCards() {
    return prepareDemoCards(rawCards.slice(0, LANDING_DEMO_CARD_LIMIT));
}

export function patchDefinitionImage(cards, cardId, imagePath, defIndex, form) {
    return cards.map((card) => {
        if (card.id !== cardId) return card;

        if (form === 'v2' && card.irregular?.past) {
            const past = { ...card.irregular.past };
            if (Array.isArray(past.definitions) && past.definitions.length > 0) {
                const defs = [...past.definitions];
                if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath };
                return { ...card, irregular: { ...card.irregular, past: { ...past, definitions: defs } } };
            }
            if (defIndex === 0) {
                return { ...card, irregular: { ...card.irregular, past: { ...past, imagePath } } };
            }
        }
        if (form === 'v3' && card.irregular?.participle) {
            const part = { ...card.irregular.participle };
            if (Array.isArray(part.definitions) && part.definitions.length > 0) {
                const defs = [...part.definitions];
                if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath };
                return { ...card, irregular: { ...card.irregular, participle: { ...part, definitions: defs } } };
            }
            if (defIndex === 0) {
                return { ...card, irregular: { ...card.irregular, participle: { ...part, imagePath } } };
            }
        }

        const defs = [...(card.definitions || [])];
        if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath };
        return { ...card, definitions: defs };
    });
}

export const INITIAL_DEMO_CARDS = createDemoSessionCards();

export { buildLandingDemoImagePath };
