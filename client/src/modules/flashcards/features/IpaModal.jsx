import React, { useState } from 'react';
import styles from './IpaModal.module.css';
import { useUIContext } from '../../../context/UIContext';
import { getFlashcardTranslations } from '../config/translations';

// --- Data for the modal ---
const ipaSymbols = ['i', 'ɪ', 'ɛ', 'æ', 'ɑ', 'ʌ', 'ɚ', 'ɔ', 'o', 'uː', 'ʊ', 'ɝ'];

// Long/tense vowels get a distinct color from short/lax vowels
const longVowels = ['i', 'uː', 'ɑ', 'ɔ', 'ɝ'];

// Position of each symbol as % of the chart container (4:3 aspect ratio)
const symbolPositions = {
    'i':  { left: '9%',    top: '9%'   },
    'ɪ':  { left: '27.5%', top: '30%'  },
    'ɛ':  { left: '35%',   top: '53%'  },
    'æ':  { left: '42.5%', top: '80%'  },
    'ɑ':  { left: '75%',   top: '87%'  },
    'ʌ':  { left: '57.5%', top: '63%'  },
    'ɔ':  { left: '75%',   top: '67%'  },
    'o':  { left: '80%',   top: '43%'  },
    'uː': { left: '85%',   top: '9%'   },
    'ʊ':  { left: '75%',   top: '30%'  },
    'ɚ':  { left: '52.5%', top: '50%'  },
    'ɝ':  { left: '52.5%', top: '58.5%'},
};

const symbolToFileNameMap = {
    'i': 'i-', 'ɪ': 'ɪ', 'ɛ': 'e', 'æ': 'æ', 'ɑ': 'ɑ-', 'ʌ': 'ʌ', 'ɚ': 'ə',
    'ɔ': 'ɔ-', 'o': 'ɒ', 'uː': 'u-', 'ʊ': 'ʊ', 'ɝ': 'ɜ-'
};

// Example word shown in the tooltip / title attribute
const exampleWords = {
    'i': 'see', 'ɪ': 'sit', 'ɛ': 'bed', 'æ': 'cat', 'ɑ': 'father',
    'ʌ': 'cup', 'ɚ': 'letter', 'ɔ': 'saw', 'o': 'go', 'uː': 'food',
    'ʊ': 'book', 'ɝ': 'bird'
};
// --- End Data ---

// Trapecio vocálico vectorial: forma exterior + líneas guía internas
const VowelChartBackground = () => (
    <svg viewBox="0 0 400 300" className={styles.chartSvg} preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        {/* Forma exterior del trapecio (anterior/cerrada -> posterior/abierta) */}
        <polygon points="20,20 380,20 380,280 180,280" className={styles.chartLineOuter} />

        {/* Líneas guía horizontales: dividen la apertura en tres tercios */}
        <line x1="73.3" y1="106.6" x2="380" y2="106.6" className={styles.chartLineInner} />
        <line x1="126.6" y1="193.3" x2="380" y2="193.3" className={styles.chartLineInner} />
        
        {/* Línea guía vertical central */}
        <line x1="200" y1="20" x2="280" y2="280" className={styles.chartLineInner} />
    </svg>
);

function IpaModal({ onClose }) {
    const [activeSymbol, setActiveSymbol] = useState(null);
    const [errorSymbol, setErrorSymbol] = useState(null);
    const { language = 'en' } = useUIContext();
    const t = getFlashcardTranslations(language).ipaModal;

    const speakIPA = (symbol) => {
        const fileName = symbolToFileNameMap[symbol];
        if (!fileName) {
            console.error(`No audio file name mapped for IPA symbol: ${symbol}`);
            setErrorSymbol(symbol);
            setTimeout(() => setErrorSymbol(null), 600);
            return;
        }

        const audio = new Audio(`/audio/${fileName}.mp4`);

        setActiveSymbol(symbol);
        audio.addEventListener('ended', () => setActiveSymbol(null));

        audio.play().catch(e => {
            console.error(`Error playing /audio/${fileName}.mp4:`, e);
            setActiveSymbol(null);
            setErrorSymbol(symbol);
            setTimeout(() => setErrorSymbol(null), 600);
        });
    };

    return (
        <div className={styles.modal} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose} aria-label="Cerrar">&times;</button>
                <h2 className={styles.modalTitle}>{t.title}</h2>

                <div className={styles.chartWrapper}>
                    {/* Etiquetas de eje horizontal: anterior / central / posterior */}
                    <div className={styles.axisTop}>
                        <span>{t.front}</span>
                        <span>{t.central}</span>
                        <span>{t.back}</span>
                    </div>

                    <div className={styles.chartRow}>
                        {/* Etiquetas de eje vertical: cerrada / media / abierta */}
                        <div className={styles.axisLeft}>
                            <span>{t.close}</span>
                            <span>{t.mid}</span>
                            <span>{t.open}</span>
                        </div>

                        <div className={styles.ipaChart}>
                            <VowelChartBackground />

                            {ipaSymbols.map(symbol => {
                                const isLong = longVowels.includes(symbol);
                                const isActive = activeSymbol === symbol;
                                const isError = errorSymbol === symbol;

                                const classNames = [
                                    styles.ipaBtn,
                                    isLong ? styles.ipaBtnLong : styles.ipaBtnShort,
                                    isActive ? styles.ipaBtnActive : '',
                                    isError ? styles.ipaBtnError : '',
                                ].filter(Boolean).join(' ');

                                return (
                                    <button
                                        key={symbol}
                                        className={classNames}
                                        style={symbolPositions[symbol]}
                                        onClick={() => speakIPA(symbol)}
                                        aria-label={`Play sound ${symbol}, as in ${exampleWords[symbol]}`}
                                        title={`/${symbol}/ — ${exampleWords[symbol]}`}
                                    >
                                        {symbol}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Leyenda de color */}
                    <div className={styles.legend}>
                        <span className={styles.legendItem}>
                            <span className={`${styles.legendDot} ${styles.legendDotLong}`} />
                            {t.long}
                        </span>
                        <span className={styles.legendItem}>
                            <span className={`${styles.legendDot} ${styles.legendDotShort}`} />
                            {t.short}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default IpaModal;
