/**
 * Casos de uso de sesión de deck (lógica pura, sin React).
 */

import { filterUnlearned } from './deckUseCases.js';

export const updateCardImageInDeck = (cards, cardId, newPath, defIndex, form = 'v1') =>
    cards.map((card) => {
        if (card.id !== cardId) return card;
        if (form === 'v1') {
            const defs = [...card.definitions];
            if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath: newPath };
            return { ...card, definitions: defs };
        }
        if (card.irregular) {
            const newIrregular = { ...card.irregular };
            const targetForm = form === 'v2' ? 'past' : 'participle';
            const block = newIrregular[targetForm];
            if (block) {
                if (Array.isArray(block.definitions) && block.definitions.length > 0) {
                    const defs = [...block.definitions];
                    if (defs[defIndex]) defs[defIndex] = { ...defs[defIndex], imagePath: newPath };
                    newIrregular[targetForm] = { ...block, definitions: defs };
                } else {
                    newIrregular[targetForm] = { ...block, imagePath: newPath };
                }
            }
            return { ...card, irregular: newIrregular };
        }
        return card;
    });

export const removeDefinitionFromDeck = (cards, cardId, defIndex, form = 'v1') =>
    cards.map((card) => {
        if (card.id !== cardId) return card;
        if (form === 'v1') {
            if (!Array.isArray(card.definitions)) return card;
            const defs = card.definitions.filter((_, i) => i !== defIndex);
            return { ...card, definitions: defs };
        }
        if (card.irregular) {
            const newIrregular = { ...card.irregular };
            const targetForm = form === 'v2' ? 'past' : 'participle';
            const block = newIrregular[targetForm];
            if (block && Array.isArray(block.definitions)) {
                const defs = block.definitions.filter((_, i) => i !== defIndex);
                newIrregular[targetForm] = { ...block, definitions: defs };
            }
            return { ...card, irregular: newIrregular };
        }
        return card;
    });

export const applyLearnedStatus = (cards, cardId, learned) =>
    cards.map((c) => (c.id === cardId ? { ...c, learned } : c));

export const getGroupLearnedCards = (cards, groupName) =>
    cards.filter((card) => {
        const cardGroupName = card.group_name || 'General';
        return cardGroupName === groupName && card.learned;
    });

export const resetGroupInDeck = (cards, groupName) =>
    cards.map((card) => {
        const cardGroupName = card.group_name || 'General';
        if (cardGroupName !== groupName) return card;
        return { ...card, learned: false };
    });

export const computeFilteredAfterLearn = (masterData, cardId, selectedGroup) => {
    const updated = applyLearnedStatus(masterData, cardId, true);
    const remaining = filterUnlearned(updated, selectedGroup);
    return { updated, remaining, completed: remaining.length === 0 };
};

export const computeNextIndex = (currentIndex, remainingLength) =>
    currentIndex >= remainingLength ? Math.max(0, remainingLength - 1) : currentIndex;

const normalizeCardIdentity = (value) => String(value || '').trim().toLocaleLowerCase();

const getCardIdentity = (card) => normalizeCardIdentity(
    card?.word || card?.name || card?.translation,
);

/**
 * Restaura la misma tarjeta aunque el catálogo haya cambiado de orden.
 * `cardId` es solo una coordenada posicional y puede quedar obsoleta después
 * de una migración; `cardWord` conserva la identidad semántica del contenido.
 */
export const resolveResumeCardIndex = (cards, resumeSession) => {
    if (!Array.isArray(cards) || cards.length === 0) return 0;

    const savedIdentity = normalizeCardIdentity(resumeSession?.cardWord);
    if (savedIdentity) {
        const byIdentity = cards.findIndex((card) => getCardIdentity(card) === savedIdentity);
        if (byIdentity >= 0) return byIdentity;
    }

    if (typeof resumeSession?.cardId === 'number') {
        const byId = cards.findIndex((card) => card.id === resumeSession.cardId);
        if (byId >= 0) return byId;
    }

    if (typeof resumeSession?.cardIndex === 'number') {
        return Math.min(Math.max(0, resumeSession.cardIndex), cards.length - 1);
    }

    return 0;
};
