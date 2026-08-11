import { getFlashcardTranslations } from '../config/translations';

export function getCategoryDisplayName(category, language = 'en') {
    if (!category) return '';
    const t = getFlashcardTranslations(language)?.categorySelector;
    const label = t?.categories?.[category]
        || category.replace(/[_-]/g, ' ').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return label.toUpperCase();
}

export function getGroupDisplayName(group, language = 'en') {
    if (!group) return '';
    const t = getFlashcardTranslations(language)?.categorySelector;
    return t?.groups?.[group] || group;
}

export function getProgressLabel(category, group, language = 'en') {
    const categoryLabel = getCategoryDisplayName(category, language);
    if (group) {
        return `${categoryLabel} • ${getGroupDisplayName(group, language).toUpperCase()}`;
    }
    return categoryLabel;
}
