import React from 'react';
import styles from './CompletionCard.module.css';
import { getFlashcardTranslations } from '../config/translations';
import { getCategoryDisplayName, getGroupDisplayName } from './categoryDisplay';

const getDeckDisplayName = (deckName, language) => {
    if (!deckName) return '';
    const locale = language === 'es' ? 'es' : 'en';
    const lower = deckName.toLowerCase();
    if (lower.includes('advanced')) return getFlashcardTranslations(locale).categorySelector.levels.advanced;
    if (lower.includes('intermediate')) return getFlashcardTranslations(locale).categorySelector.levels.intermediate;
    if (lower.includes('basic')) return getFlashcardTranslations(locale).categorySelector.levels.basic;
    return deckName;
};

const formatRecommendation = (step, language) => {
    if (!step) return null;

    const categoryLabel = getCategoryDisplayName(step.category, language);
    const deckLabel = getDeckDisplayName(step.deck, language);
    const groupLabel = step.group ? getGroupDisplayName(step.group, language) : null;

    if (groupLabel) return `${categoryLabel} • ${deckLabel} • ${groupLabel}`;
    if (deckLabel) return `${categoryLabel} • ${deckLabel}`;
    return categoryLabel;
};

export default function CompletionCard({
    language = 'en',
    completionScope,
    completedLabel,
    completedCount,
    totalCount,
    allLearned = true,
    recommendation,
    onContinue,
    onOpenCatalog,
    onRestart,
}) {
    const locale = language === 'es' ? 'es' : 'en';
    const t = getFlashcardTranslations(locale).completionCard;
    const recommendationLabel = formatRecommendation(recommendation, locale);

    return (
        <div className={styles.overlay}>
            <div className={styles.card}>
                <div className={styles.celebrationHalo} />
                <div className={styles.lightSweep} />
                <div className={styles.confettiField} aria-hidden="true">
                    <span className={`${styles.confetti} ${styles.confettiA}`} />
                    <span className={`${styles.confetti} ${styles.confettiB}`} />
                    <span className={`${styles.confetti} ${styles.confettiC}`} />
                    <span className={`${styles.confetti} ${styles.confettiD}`} />
                    <span className={`${styles.confetti} ${styles.confettiE}`} />
                    <span className={`${styles.confetti} ${styles.confettiF}`} />
                    <span className={`${styles.spark} ${styles.sparkA}`} />
                    <span className={`${styles.spark} ${styles.sparkB}`} />
                    <span className={`${styles.spark} ${styles.sparkC}`} />
                    <span className={`${styles.ring} ${styles.ringA}`} />
                    <span className={`${styles.ring} ${styles.ringB}`} />
                </div>
                <span className={styles.badge}>{allLearned ? t.badge : t.badgeReviewed}</span>
                <h1 className={styles.title}>
                    {completionScope === 'group'
                        ? (allLearned ? t.groupTitle : t.groupTitleReviewed)
                        : (allLearned ? t.levelTitle : t.levelTitleReviewed)}
                </h1>
                <p className={styles.subtitle}>
                    {completionScope === 'group'
                        ? (allLearned ? t.groupSubtitle : t.groupSubtitleReviewed).replace('{topic}', completedLabel || t.defaultTopic)
                        : (allLearned ? t.levelSubtitle : t.levelSubtitleReviewed).replace('{level}', completedLabel || t.defaultLevel)}
                </p>

                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <span className={styles.statLabel}>{t.progressLabel}</span>
                        <span className={styles.statValue}>{`${completedCount}/${totalCount}`}</span>
                    </div>
                    <div className={styles.statCard}>
                        <span className={styles.statLabel}>{t.statusLabel}</span>
                        <span className={styles.statValue}>{allLearned ? t.statusValue : t.statusValueReviewed}</span>
                    </div>
                </div>

                <div className={styles.recommendation}>
                    <span className={styles.recommendationLabel}>{t.nextStepLabel}</span>
                    <span className={styles.recommendationText}>
                        {recommendationLabel || t.noRecommendation}
                    </span>
                </div>

                <div className={styles.actions}>
                    <button className={styles.primaryButton} onClick={onContinue}>
                        {recommendation ? t.continueButton : t.catalogButton}
                    </button>
                    {recommendation && (
                        <button className={styles.secondaryButton} onClick={onOpenCatalog}>
                            {t.catalogButton}
                        </button>
                    )}
                    <button className={styles.restartButton} onClick={onRestart}>
                        {allLearned ? t.restartButton : t.reviewAgainButton}
                    </button>
                </div>
            </div>
        </div>
    );
}
