import { getAudioLang, getStudyExampleText, isLearningEnglish } from './cardLanguageUtils';
import styles from './DefinitionList.module.css';
import HighlightedText from './HighlightedText';
import { LuLoaderCircle, LuTrash2 } from 'react-icons/lu';
import { FiPlay, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../../../context/AuthContext';

/**
 * DefinitionList — responsable ÚNICAMENTE de renderizar la lista de ejemplos de uso.
 * SRP: no maneja estado de imagen ni lógica de formas verbales.
 */
function DefinitionList({ definitions, blurredState, toggleBlur, playDefinitionMedia, deleteAudio, onDeletePhrase, activeAudioText, highlightedWordIndex, isDisabled, isGeneratingAudio, currentLanguage }) {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const visibleDefinitions = (definitions || []).filter((def) => {
        const exampleText = getStudyExampleText(def, currentLanguage);

        return Boolean(exampleText?.trim());
    });
    const shouldScrollExamples = visibleDefinitions.length > 2;
    const handleRotateVoice = (e, text, lang = getAudioLang(currentLanguage)) => {
        e.stopPropagation();
        deleteAudio(text, lang);
    };
    const handleDeletePhrase = (e, defIndex) => {
        e.stopPropagation();
        onDeletePhrase?.(defIndex);
    };

    return (
        <div
            className={`${styles.allExamplesContainer} ${shouldScrollExamples ? styles.scrollableExamples : ''}`}
            data-fc="examples"
            data-state={shouldScrollExamples ? 'scrollable' : 'static'}
            data-count={visibleDefinitions.length}
        >
            <ul>
                {definitions?.map((def, di) => {
                    const exampleText = getStudyExampleText(def, currentLanguage);
                    if (!exampleText?.trim()) return null;

                    const playPhraseLabel = isLearningEnglish(currentLanguage)
                        ? 'Reproducir frase'
                        : 'Play phrase';

                    return (
                    <li key={di} className={styles.exampleRow}>
                        <button
                            type="button"
                            className={`${styles.examplePlayBtn} ${isGeneratingAudio && activeAudioText === exampleText ? styles.loadingAudioBtn : ''}`}
                            onClick={(e) => { e.stopPropagation(); playDefinitionMedia(di, exampleText, getAudioLang(currentLanguage)); }}
                            disabled={isDisabled}
                            data-tour={di === 0 ? 'boton-reproducir-audio-frase' : undefined}
                            data-tour-role={di === 0 ? 'phrase-audio-play' : undefined}
                            title={playPhraseLabel}
                            aria-label={playPhraseLabel}
                        >
                            {isGeneratingAudio && activeAudioText === exampleText
                                ? <LuLoaderCircle className={styles.spinner} />
                                : <FiPlay size={24} strokeWidth={2.5} />}
                        </button>

                        <div
                            className={`${styles.phraseContainer} ${blurredState[di] !== false ? styles.blurredText : ''}`}
                            data-phrase-revealed={blurredState[di] === false ? 'true' : undefined}
                            onClick={(e) => { e.stopPropagation(); toggleBlur(di); }}
                        >
                            <HighlightedText
                                text={exampleText}
                                activeAudioText={activeAudioText}
                                highlightedWordIndex={highlightedWordIndex}
                            />
                        </div>

                        {isAdmin && !(isGeneratingAudio && activeAudioText === exampleText) && (
                            <button
                                type="button"
                                className={styles.rotateVoiceBtn}
                                data-fc-btn="voice"
                                onClick={(e) => handleRotateVoice(e, exampleText, getAudioLang(currentLanguage))}
                                title="Actualizar voz aleatoria"
                                disabled={isDisabled}
                            >
                                <FiRefreshCw size={24} strokeWidth={2.5} />
                            </button>
                        )}

                        {isAdmin && (
                            <button
                                type="button"
                                className={styles.deletePhraseBtn}
                                data-fc-btn="delete-phrase"
                                onClick={(e) => handleDeletePhrase(e, di)}
                                title="Eliminar frase"
                                disabled={isDisabled}
                            >
                                <LuTrash2 size={24} strokeWidth={2.5} />
                            </button>
                        )}

                        {isLearningEnglish(currentLanguage) && def.pronunciation_guide_es && !blurredState[di] && (
                            <span className={styles.customTooltip}>{def.pronunciation_guide_es}</span>
                        )}
                    </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default DefinitionList;
