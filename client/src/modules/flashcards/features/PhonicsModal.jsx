import React, { useState, useEffect } from 'react';
import styles from './PhonicsModal.module.css';
import { useAudioPlayback } from '../../../components/flashcardStudy/features/useAudioPlayback.jsx';
import { flashcardPort } from '../composition';
import { useUIContext } from '../../../context/UIContext';
import { useFlashcardUiContext } from '../context/FlashcardUiContext';
import { getFlashcardTranslations } from '../config/translations';

function PhonicsModal() {
    const { setAppMessage, language = 'en' } = useUIContext();
    const { setIsAudioLoading, setIsPhonicsModalOpen } = useFlashcardUiContext();
    const [phonicsData, setPhonicsData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    
    const t = getFlashcardTranslations(language).phonicsModal;

    const { playAudio, isAudioPlaying, activeAudioText } = useAudioPlayback({
        setAppMessage, setIsAudioLoading, currentCategory: "phonics",
        currentDeckName: "phonics", verbName: 'phonics_sample'
    });

    useEffect(() => {
        const fetchPhonicsData = async () => {
            setIsLoading(true);
            try {
                const data = await flashcardPort.fetchPhonicsData();
                if (Array.isArray(data)) setPhonicsData(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPhonicsData();
    }, []);

    const onClose = () => setIsPhonicsModalOpen(false);

    const renderContent = () => {
        if (isLoading) return <div className={styles.loading}>{t.loading}</div>;
        if (error) return <div className={styles.error}>{error}</div>;
        if (phonicsData.length === 0) return <div className={styles.error}>{t.errorEmpty}</div>;

        return (
            <div className={styles.rulesContainer}>
                {phonicsData.map((ruleData, index) => (
                    <div key={index} className={styles.ruleBlock}>
                        <h3 className={styles.ruleTitle}>
                            <span className={styles.ruleText}>{ruleData.rule}</span>
                            <span className={styles.ruleSoundsLike}>{ruleData.sounds_like}</span>
                        </h3>
                        <div className={styles.examplesGrid}>
                            {ruleData.examples.map((example, exIndex) => {
                                const isActive = isAudioPlaying && activeAudioText === example;
                                return (
                                    <button key={exIndex} className={`${styles.exampleButton} ${isActive ? styles.activeButton : ''}`}
                                        onClick={() => playAudio(example)} disabled={isAudioPlaying}>
                                        <span className={styles.audioIcon}>{isActive ? '...' : '🔊'}</span>
                                        <div className={styles.exampleTextContainer}>
                                            <span className={styles.exampleText}>{example}</span>
                                            <span className={styles.exampleIpa}>{ruleData.ipa[exIndex]}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className={styles.modal} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>&times;</button>
                {renderContent()}
            </div>
        </div>
    );
}

export default PhonicsModal;
