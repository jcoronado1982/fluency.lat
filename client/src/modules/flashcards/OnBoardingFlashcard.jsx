import React, { useEffect, useMemo, useState } from 'react';
import { useUIContext } from '../../context/UIContext';
import { preloadFlashcardStart } from './preload';
import { useAuth } from '../../context/AuthContext';
import styles from './OnBoardingFlashcard.module.css';

const COPY = {
    es: {
        interfaceOptions: [
            { id: 'es', title: 'Ver la app en Español', flag: '🇪🇸' },
            { id: 'en', title: 'Ver la app en Inglés', flag: '🇺🇸' },
        ],
        studyOptions: [
            { id: 'en', title: 'Quiero aprender Inglés', fromFlags: '🇪🇸', toFlags: '🇬🇧 🇺🇸' },
            { id: 'es', title: 'Quiero aprender Español', fromFlags: '🇬🇧 🇺🇸', toFlags: '🇪🇸' },
        ],
        stepLabel: 'Flujo de Onboarding: Paso',
        next: 'Siguiente',
        selectLanguage: 'Selecciona un idioma',
        continueSpanish: 'Continuar con Español',
        continueEnglish: 'Continuar con Inglés',
        continueTourEntry: 'Siguiente',
        startLearning: 'Comenzar a aprender',
        back: 'Atrás',
        welcomeTitle: '¡Te damos la bienvenida a Fluency!',
        welcomeSubtitle: '¿En qué idioma prefieres ver los menús y las instrucciones de la aplicación?',
        studyTitle: 'Tu idioma de estudio',
        studySubtitle: '¿Qué idiomas quieres estudiar?',
        completed: 'Completado',
        selected: 'Seleccionado',
        englishLabel: 'Inglés',
        spanishLabel: 'Español',
    },
    en: {
        interfaceOptions: [
            { id: 'es', title: 'View the app in Spanish', flag: '🇪🇸' },
            { id: 'en', title: 'View the app in English', flag: '🇺🇸' },
        ],
        studyOptions: [
            { id: 'en', title: 'I want to learn English', fromFlags: '🇪🇸', toFlags: '🇬🇧 🇺🇸' },
            { id: 'es', title: 'I want to learn Spanish', fromFlags: '🇬🇧 🇺🇸', toFlags: '🇪🇸' },
        ],
        stepLabel: 'Onboarding Flow: Step',
        next: 'Next',
        selectLanguage: 'Select a language',
        continueSpanish: 'Continue with Spanish',
        continueEnglish: 'Continue with English',
        continueTourEntry: 'Next',
        startLearning: 'Start learning',
        back: 'Back',
        welcomeTitle: 'Welcome to Fluency!',
        welcomeSubtitle: 'Which language would you like to use for the app menus and instructions?',
        studyTitle: 'Your study language',
        studySubtitle: 'What languages do you want to study?',
        completed: 'Complete',
        selected: 'Selected',
        englishLabel: 'English',
        spanishLabel: 'Spanish',
    },
};

const STEP_TOTAL = 4;

const OnBoardingFlashcard = ({
    module,
    user,
    onStart,
    onStartTour,
}) => {
    const { updateStudyLanguage } = useAuth();
    const {
        language,
        setLanguage,
        studyLanguage,
        setStudyLanguage,
        setIsHeaderSuppressed,
    } = useUIContext();
    const locale = language === 'es' ? 'es' : 'en';
    const t = COPY[locale];
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedStudyLanguage, setSelectedStudyLanguage] = useState(studyLanguage === 'es' ? 'es' : 'en');
    const [selectedInterfaceLanguage, setSelectedInterfaceLanguage] = useState(
        language === 'es' ? 'es' : 'en',
    );
    const progressPercent = Math.round((currentStep / STEP_TOTAL) * 100);

    useEffect(() => {
        setIsHeaderSuppressed(currentStep <= 2);

        return () => {
            setIsHeaderSuppressed(false);
        };
    }, [currentStep, setIsHeaderSuppressed]);

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, []);

    useEffect(() => {
        void preloadFlashcardStart(user?.email, null, selectedStudyLanguage);
    }, [selectedStudyLanguage, user?.email]);

    const primaryButtonLabel = useMemo(() => {
        if (currentStep === 1) {
            return t.next;
        }
        if (currentStep === 2) {
            return t.continueTourEntry;
        }
        if (currentStep === 3) {
            return t.selectLanguage;
        }
        return t.startLearning;
    }, [currentStep, t]);

    const canContinue = currentStep !== 2 || Boolean(selectedStudyLanguage);

    const handleContinue = async () => {
        if (currentStep === 2 && !selectedStudyLanguage) return;
        if (currentStep === 1) {
            setCurrentStep(2);
            return;
        }
        if (currentStep === 2) {
            onStartTour(module.to);
            return;
        }
        await onStart(module.to);
    };

    const handleBack = () => {
        if (currentStep === 1) return;
        setCurrentStep((step) => step - 1);
    };

    const renderStepContent = () => {
        if (currentStep === 1) {
            return (
                <>
                    <h1 className={styles.title}>{t.welcomeTitle}</h1>
                    <p className={styles.subtitle}>
                        <span className={styles.subtitleLead}>
                            {user?.name || user?.email || 'Usuario'},
                        </span>
                        <span className={styles.subtitleQuestion}>{t.welcomeSubtitle}</span>
                    </p>

                    <section className={styles.pillList}>
                        {t.interfaceOptions.map((option) => {
                            const isSelected = selectedInterfaceLanguage === option.id;

                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedInterfaceLanguage(option.id);
                                        setLanguage(option.id);
                                    }}
                                    className={`${styles.pillButton} ${isSelected ? styles.pillButtonSelected : ''}`}
                                >
                                    <span className={styles.pillButtonFlag}>{option.flag}</span>
                                    <span className={styles.pillButtonText}>{option.title}</span>
                                    {isSelected && <span className={styles.selectionCheck}>✓</span>}
                                </button>
                            );
                        })}
                    </section>
                </>
            );
        }

        if (currentStep === 2) {
            return (
                <>
                    <h1 className={`${styles.title} ${styles.studyTitle}`}>{t.studyTitle}</h1>
                    <p className={styles.subtitle}>
                        {t.studySubtitle}
                    </p>
                    <section className={styles.grid}>
                        {t.studyOptions.map((option) => {
                            const isSelected = selectedStudyLanguage === option.id;

                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedStudyLanguage(option.id);
                                        setStudyLanguage(option.id);
                                        void updateStudyLanguage(option.id);
                                    }}
                                    className={`${styles.optionCard} ${isSelected ? styles.optionCardSelected : ''}`}
                                >
                                    <span className={styles.optionFlagRow}>
                                        <span className={styles.optionFlagGroup}>{option.fromFlags}</span>
                                        <span className={styles.optionFlagArrow} aria-hidden="true">→</span>
                                        <span className={styles.optionFlagGroup}>{option.toFlags}</span>
                                    </span>
                                    <h2 className={styles.optionTitle}>{option.title}</h2>
                                    {isSelected && (
                                        <span className={styles.optionSelectedLabel}>
                                            <span className={styles.optionSelectedIcon}>✓</span>
                                            {t.selected}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </section>
                </>
            );
        }

        return null;
    };

    return (
        <main className={styles.page} data-onboarding-wizard="true">
            <section className={styles.hero}>
                <div className={styles.progressHeader}>
                    <p className={styles.eyebrow}>
                        {t.stepLabel} {currentStep} / {STEP_TOTAL}
                    </p>
                    <p className={styles.progressCopy}>
                        {progressPercent}% {t.completed}
                    </p>
                </div>
                <div className={styles.progressTrack} aria-hidden="true">
                    <span className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
                </div>
                {renderStepContent()}

                <div className={styles.actions}>
                    {currentStep > 1 && (
                        <button type="button" onClick={handleBack} className={`${styles.button} ${styles.buttonSecondary}`}>
                            {t.back}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleContinue}
                        disabled={!canContinue}
                        className={`${styles.button} ${styles.buttonPrimary}`}
                    >
                        {primaryButtonLabel}
                    </button>
                </div>
            </section>
        </main>
    );
};

export default OnBoardingFlashcard;
