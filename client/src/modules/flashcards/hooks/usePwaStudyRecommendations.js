import { useEffect, useState } from 'react';
import { getCourseDirectionFromStudyLanguage } from '../../../contracts/courseDirection';
import { normalizeCardImageUrl } from '../../../utils/mediaUrl';
import { flashcardPort } from '../composition';
import {
    buildPwaStudyRecommendations,
    extractPwaRecommendationImage,
} from '../useCases/pwaStudyRecommendations';

export function usePwaStudyRecommendations({
    enabled,
    currentCategory,
    currentDeck,
    language,
    studyLanguage,
    userEmail,
}) {
    const [recommendations, setRecommendations] = useState([]);

    useEffect(() => {
        if (!enabled) {
            setRecommendations([]);
            return undefined;
        }

        let cancelled = false;
        const load = async () => {
            try {
                const courseDirection = getCourseDirectionFromStudyLanguage(studyLanguage);
                const result = await flashcardPort.fetchLearningStats(courseDirection);
                if (cancelled || !result?.success || !result.stats) return;
                const nextRecommendations = buildPwaStudyRecommendations({
                    stats: result.stats,
                    currentCategory,
                    currentDeck,
                    language,
                    limit: 4,
                });
                const withImages = await Promise.all(nextRecommendations.map(async (item) => {
                    if (item.firstImagePath || !userEmail) return item;
                    try {
                        const deckData = await flashcardPort.fetchDeckData(
                            userEmail,
                            item.category,
                            item.deckName.replace(/\.json$/i, ''),
                            courseDirection,
                        );
                        const imagePath = extractPwaRecommendationImage(deckData);
                        return imagePath
                            ? { ...item, firstImagePath: normalizeCardImageUrl(imagePath) }
                            : item;
                    } catch {
                        return item;
                    }
                }));
                if (!cancelled) setRecommendations(withImages);
            } catch {
                if (!cancelled) setRecommendations([]);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [currentCategory, currentDeck, enabled, language, studyLanguage, userEmail]);

    return recommendations;
}
