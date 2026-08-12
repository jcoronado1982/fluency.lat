import { useEffect, useMemo, useState } from 'react';
import { sortGroups, sinkRecentCategory } from '../config/catalogOrder';
import {
    applyPreferenceOrder,
    getGroupOrderPreference,
    moveOrderedItem,
    saveGroupOrderPreference,
} from '../config/catalogPreferences';
import { isPersonalDeckName } from '../useCases/deckUseCases';

/**
 * Orden local (drag-and-drop) de los grupos de un mazo plano y de los mazos anidados de un
 * nivel — persiste en `user.catalog_preferences` vía `saveGroupOrderPreference`, con estado en
 * memoria (`localGroupOrder`/`localNestedDeckOrder`) para que el arrastre se sienta fluido antes
 * de guardar. Aislado de `CategorySelector.jsx` (SRP): esta pieza solo sabe de ORDEN, no de cómo
 * se pinta ni de cómo se arrastra (ver `useDragReorder`).
 */
export function useLocalCatalogOrder({
    user,
    updateCatalogPreferences,
    currentCategory,
    currentDeckName,
    masterData,
    nestedDeckNames,
    deckSummaries,
    recentlyFinishedDecks,
    activeLevel,
}) {
    const groupsMap = useMemo(() => {
        const map = {};
        masterData.forEach((card) => {
            const groupName = card.group_name || 'General';
            if (!map[groupName]) {
                map[groupName] = [];
            }
            map[groupName].push(card);
        });
        return map;
    }, [masterData]);

    const groupNames = useMemo(() => Object.keys(groupsMap), [groupsMap]);

    const completedGroupNames = useMemo(() => {
        return groupNames.filter((groupName) => {
            const cards = groupsMap[groupName] || [];
            return cards.length > 0 && cards.every((card) => card.learned);
        });
    }, [groupNames, groupsMap]);

    const completedNestedDeckNames = useMemo(() => {
        return nestedDeckNames.filter((deckName) => {
            const summary = deckSummaries[deckName];
            return summary?.total > 0 && summary.learned === summary.total;
        });
    }, [nestedDeckNames, deckSummaries]);

    const [localGroupOrder, setLocalGroupOrder] = useState([]);
    const [localNestedDeckOrder, setLocalNestedDeckOrder] = useState([]);

    const recentNestedDecks = useMemo(
        () => recentlyFinishedDecks
            .filter((entry) => entry.category === currentCategory)
            .map((entry) => entry.deck),
        [recentlyFinishedDecks, currentCategory],
    );

    const groupNamesKey = groupNames.join(',');
    const completedGroupNamesKey = completedGroupNames.join(',');
    const nestedDeckNamesKey = nestedDeckNames.join(',');
    const completedNestedDeckNamesKey = completedNestedDeckNames.join(',');
    const recentNestedDecksKey = recentNestedDecks.join(',');

    useEffect(() => {
        const storedGroupOrder = getGroupOrderPreference(
            user?.email,
            currentCategory,
            currentDeckName,
            groupNames,
            user?.catalog_preferences,
        );
        const ordered = sortGroups(
            currentCategory,
            currentDeckName,
            groupNames,
            storedGroupOrder,
            completedGroupNames,
        );
        setLocalGroupOrder(ordered);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentCategory, currentDeckName, groupNamesKey, user?.catalog_preferences, completedGroupNamesKey, user?.email]);

    const levelPreferenceKey = `__level__${activeLevel || 'basic'}`;
    useEffect(() => {
        const storedNestedDeckOrder = getGroupOrderPreference(
            user?.email,
            currentCategory,
            levelPreferenceKey,
            nestedDeckNames,
            user?.catalog_preferences,
        );
        const ordered = sinkRecentCategory(
            applyPreferenceOrder(nestedDeckNames, storedNestedDeckOrder),
            recentNestedDecks,
            completedNestedDeckNames,
        );
        // "Crear palabra": el usuario debe poder ubicar lo que acaba de crear fácil — siempre
        // primero, sin importar el orden guardado en sus preferencias (que nunca conoció este
        // mazo al guardarse). `applyPreferenceOrder` empuja cualquier mazo ausente de la
        // preferencia al final; lo reordenamos acá, después, para no tocar esa lógica genérica.
        const personalFirst = [
            ...ordered.filter(isPersonalDeckName),
            ...ordered.filter((name) => !isPersonalDeckName(name)),
        ];
        setLocalNestedDeckOrder(personalFirst);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentCategory, levelPreferenceKey, nestedDeckNamesKey, user?.catalog_preferences, completedNestedDeckNamesKey, user?.email, recentNestedDecksKey]);

    const visibleGroups = (localGroupOrder.length > 0 ? localGroupOrder : groupNames)
        .map((name) => {
            const cards = groupsMap[name] || [];
            const total = cards.length;
            const learned = cards.filter((c) => c.learned).length;
            return { name, total, learned };
        });
    const visibleNestedDecks = localNestedDeckOrder.length > 0 ? localNestedDeckOrder : nestedDeckNames;

    const moveLocalGroup = (fromIndex, toIndex) => {
        let next;
        setLocalGroupOrder((previous) => {
            next = moveOrderedItem(previous, fromIndex, toIndex);
            return next;
        });

        setTimeout(() => {
            if (next) {
                const nextPreferences = saveGroupOrderPreference(
                    user?.email,
                    currentCategory,
                    currentDeckName,
                    next,
                    user?.catalog_preferences,
                );
                void updateCatalogPreferences(nextPreferences);
            }
        }, 0);
    };

    const moveLocalNestedDeck = (fromIndex, toIndex) => {
        let next;
        setLocalNestedDeckOrder((previous) => {
            next = moveOrderedItem(previous, fromIndex, toIndex);
            return next;
        });

        setTimeout(() => {
            if (next) {
                const nextPreferences = saveGroupOrderPreference(
                    user?.email,
                    currentCategory,
                    levelPreferenceKey,
                    next,
                    user?.catalog_preferences,
                );
                void updateCatalogPreferences(nextPreferences);
            }
        }, 0);
    };

    return {
        visibleGroups,
        visibleNestedDecks,
        moveLocalGroup,
        moveLocalNestedDeck,
    };
}
