// src/features/flashcards/HighlightedText.jsx
import React from 'react';
import styles from './Examples.module.css';

function HighlightedText({ text, activeAudioText, highlightedWordIndex }) {
    if (!text) return null;

    const normalizedText = text.trim();
    const words = normalizedText.split(/\s+/);
    const isActive = activeAudioText?.trim() === normalizedText;

    return (
        <>
            {words.map((word, index) => (
                <span
                    key={index}
                    className={
                        isActive && highlightedWordIndex === index
                            ? styles.highlightedWord
                            : undefined
                    }
                >
                    {word}{index < words.length - 1 ? ' ' : ''}
                </span>
            ))}
        </>
    );
}

export default React.memo(HighlightedText); // Usamos memo para optimizar
