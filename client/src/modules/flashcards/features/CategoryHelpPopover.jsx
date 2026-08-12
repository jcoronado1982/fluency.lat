import React, { useEffect, useRef, useState } from 'react';
import { LuCircleHelp } from 'react-icons/lu';
// Reusa el stylesheet de CategorySelector a propósito: las reglas `.helpPopover*` están
// repartidas en varias `@media` queries no contiguas ahí — moverlas a un módulo CSS propio es
// alto riesgo de romper el responsive sin que el harness de pixel-diff lo detecte (no abre el
// popover en sus capturas). Separar el COMPONENTE (estado/lógica/JSX) ya cumple el objetivo de
// SRP; la hoja de estilos puede seguir compartida.
import styles from './CategorySelector.module.css';
import { getFlashcardTranslations } from '../config/translations';
import { getHelpForCourse } from '../config/categoryHelpByCourse';

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildHighlightPattern = (items) => items
    .filter(Boolean)
    .map((item) => {
        const text = String(item);
        const escaped = escapeRegExp(text);

        // Highlight standalone words like "in" or "to" without matching inside "going".
        if (/^[A-Za-z]+$/.test(text)) {
            return `\\b${escaped}\\b`;
        }

        return escaped;
    })
    .join('|');

const getCategoryHelpContent = (category, uiTranslations) => {
    const help = uiTranslations?.categoryHelp?.[category] || uiTranslations?.categoryHelp?.nouns;
    if (!help) return null;

    return {
        title: help.title,
        summary: help.summary,
        usage: help.usage,
        example: help.example,
        exampleSentence: help.exampleSentence ?? null,
        exampleNotes: help.exampleNotes ?? null,
        exampleHighlight: help.exampleHighlight ?? null,
        exampleTable: help.exampleTable ?? null,
    };
};

const renderHighlightedExample = (text, highlight) => {
    if (!text) return null;
    if (!highlight) return text;

    const highlightList = Array.isArray(highlight) ? highlight.filter(Boolean) : [highlight];
    if (highlightList.length === 0) return text;

    const pattern = buildHighlightPattern(highlightList);
    const parts = String(text).split(new RegExp(`(${pattern})`, 'gi'));

    return parts.map((part, index) => {
        const matchedHighlight = highlightList.find((item) => part.toLowerCase() === item.toLowerCase());
        if (matchedHighlight) {
            return (
                <strong key={`${part}-${index}`} className={styles.helpPopoverExampleHighlight}>
                    {part}
                </strong>
            );
        }
        return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    });
};

const renderExampleTable = (rows, highlight) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return (
        <table className={styles.helpPopoverExampleTable}>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.label}>
                        <th scope="row" className={styles.helpPopoverExampleRowLabel}>
                            {row.label}
                        </th>
                        <td className={styles.helpPopoverExampleRowValues}>
                            <div className={styles.helpPopoverExampleValueList}>
                                {(row.items || []).map((item) => (
                                    <span key={`${row.label}-${item}`} className={styles.helpPopoverExampleValue}>
                                        {renderHighlightedExample(item, highlight)}
                                    </span>
                                ))}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const renderExampleNotes = (notes, highlight) => {
    if (!Array.isArray(notes) || notes.length === 0) return null;

    return (
        <div className={styles.helpPopoverExampleNotes}>
            {notes.map((note, index) => (
                <p
                    key={`${note}-${index}`}
                    className={`${styles.helpPopoverExampleNote} ${index === notes.length - 1 ? styles.helpPopoverExampleRule : ''}`}
                >
                    {renderHighlightedExample(note, highlight)}
                </p>
            ))}
        </div>
    );
};

const getCategoryQuestionTitle = (category, language, fallbackTitle) => {
    const isSpanish = language === 'es';
    const questionTitles = isSpanish
        ? {
            nouns: '¿Qué es un sustantivo?',
            verbs: '¿Qué es un verbo?',
            adjectives: '¿Qué es un adjetivo?',
            adverbs: '¿Qué es un adverbio?',
            preposition: '¿Qué es una preposición?',
            pronouns: '¿Qué es un pronombre?',
            connectors: '¿Qué es un conector?',
            determinant: '¿Qué es un determinante?',
            phrasal_verbs: '¿Qué es un verbo frasal?',
        }
        : {
            nouns: 'What is a noun?',
            verbs: 'What is a verb?',
            adjectives: 'What is an adjective?',
            adverbs: 'What is an adverb?',
            preposition: 'What is a preposition?',
            pronouns: 'What is a pronoun?',
            connectors: 'What is a connector?',
            determinant: 'What is a determiner?',
            phrasal_verbs: 'What is a phrasal verb?',
        };

    return questionTitles[category] || fallbackTitle;
};

/**
 * Botón "?" + popover de ayuda gramatical por categoría — autocontenido: computa su propio
 * contenido (merge de traducción de interfaz + traducción del idioma de estudio + ayuda
 * específica de curso), maneja su propio estado abierto/cerrado y el cierre por click-fuera/Esc.
 * `CategorySelector.jsx` solo le pasa qué categoría/idiomas mostrar.
 */
function CategoryHelpPopover({ category, language, studyLanguage, courseDirection }) {
    const t = getFlashcardTranslations(language).categorySelector;
    const helpQuestionTitle = getCategoryQuestionTitle(category, language, t.helpPopoverTitle || '');
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const helpPopoverRef = useRef(null);
    const helpButtonRef = useRef(null);

    const courseSpecificHelp = getHelpForCourse(courseDirection, category);
    const studyLocale = studyLanguage === 'de' ? 'de' : studyLanguage === 'es' ? 'es' : 'en';
    const interfaceHelpContent = getCategoryHelpContent(category, getFlashcardTranslations(language).categorySelector);
    const studyHelpContent = getCategoryHelpContent(category, getFlashcardTranslations(studyLocale).categorySelector);
    const mergedExampleTable = interfaceHelpContent?.exampleTable?.map((row, index) => ({
        ...row,
        items: studyHelpContent?.exampleTable?.[index]?.items ?? row.items,
    })) ?? null;
    const baseHelpContent = interfaceHelpContent
        ? {
            ...interfaceHelpContent,
            example: studyHelpContent?.example ?? interfaceHelpContent.example,
            exampleSentence: studyHelpContent?.exampleSentence ?? interfaceHelpContent.exampleSentence,
            exampleNotes: studyHelpContent?.exampleNotes ?? interfaceHelpContent.exampleNotes,
            exampleHighlight: studyHelpContent?.exampleHighlight ?? interfaceHelpContent.exampleHighlight,
            exampleTable: mergedExampleTable,
        }
        : null;
    const helpContent = courseSpecificHelp
        ? {
            ...baseHelpContent,
            ...courseSpecificHelp,
            title: language === 'es' ? courseSpecificHelp.title : (baseHelpContent?.title || courseSpecificHelp.title),
        }
        : baseHelpContent;

    useEffect(() => {
        if (!isHelpOpen) return undefined;

        const handlePointerDown = (event) => {
            const helpNode = helpPopoverRef.current;
            const buttonNode = helpButtonRef.current;
            if (helpNode?.contains(event.target) || buttonNode?.contains(event.target)) return;
            setIsHelpOpen(false);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsHelpOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isHelpOpen]);

    return (
        <>
            <button
                type="button"
                ref={helpButtonRef}
                className={styles.helpIconBtn}
                onClick={() => setIsHelpOpen((value) => !value)}
                aria-label={t.helpButtonLabel || 'Category help'}
                aria-expanded={isHelpOpen}
                aria-controls="category-help-popover"
            >
                <LuCircleHelp />
            </button>
            {isHelpOpen && helpContent && (
                <div
                    id="category-help-popover"
                    ref={helpPopoverRef}
                    className={styles.helpPopover}
                    role="dialog"
                    aria-label={helpQuestionTitle || helpContent.title}
                >
                    <div className={styles.helpPopoverHeader}>
                        <span className={styles.helpPopoverKicker}>{helpQuestionTitle}</span>
                        <button
                            type="button"
                            className={styles.helpPopoverCloseBtn}
                            onClick={() => setIsHelpOpen(false)}
                            aria-label={language === 'es' ? 'Cerrar ayuda' : 'Close help'}
                        >
                            ×
                        </button>
                    </div>
                    <p className={styles.helpPopoverText}>{helpContent.summary}</p>
                    <div className={styles.helpPopoverBlock}>
                        <span className={styles.helpPopoverLabel}>{t.helpPopoverUsageLabel}</span>
                        <p className={styles.helpPopoverText}>{helpContent.usage}</p>
                    </div>
                    <div className={styles.helpPopoverExample}>
                        <span className={styles.helpPopoverLabel}>{t.helpPopoverExampleLabel}</span>
                        {helpContent.exampleTable ? (
                            <>
                                {renderExampleTable(helpContent.exampleTable, helpContent.exampleHighlight)}
                                {helpContent.exampleSentence ? (
                                    <p className={styles.helpPopoverExampleSentence}>
                                        {helpContent.exampleSentence}
                                    </p>
                                ) : null}
                                {renderExampleNotes(helpContent.exampleNotes, helpContent.exampleHighlight)}
                            </>
                        ) : helpContent.exampleNotes ? (
                            renderExampleNotes(helpContent.exampleNotes, helpContent.exampleHighlight)
                        ) : (
                            <p className={styles.helpPopoverExampleText}>
                                {renderHighlightedExample(helpContent.example, helpContent.exampleHighlight)}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

export default CategoryHelpPopover;
