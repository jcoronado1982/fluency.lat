// FloatingMenu.jsx

import React, { /* useState, */ useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LuEllipsisVertical } from "react-icons/lu";
import "./FloatingMenu.css";
import { useAppContext } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { translations } from '../../../config/translations';
import config from '../../../config';
import { getModuleFloatingMenuItems } from '../../index';
import LanguageSelector from '../../../components/common/LanguageSelector';

/* Opción "Pronunciación" oculta temporalmente del menú flotante.
const VOWELS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=60s";
const DIPHTHONGS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=421s";
const CONSONANTS_URL = "https://www.youtube.com/watch?v=JuFBtVFbtkA&t=600s";

const IconPronunciation = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);
*/

const FloatingMenu = ({ mobileTrigger = null }) => {
    const {
        isFloatingMenuOpen: isOpen,
        setIsFloatingMenuOpen: setIsOpen,
        language = 'en',
        setLanguage,
        studyLanguage = 'en',
        setStudyLanguage,
    } = useAppContext();
    const { user, isPremium, subscription, logout, updateStudyLanguage } = useAuth();
    // const [showPronun, setShowPronun] = useState(false);
    const containerRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    
    const t = translations[language].floatingMenu;

    const close = () => { setIsOpen(false); /* setShowPronun(false); */ };

    const moduleFloatingItems = getModuleFloatingMenuItems(config, {
        language,
        navigate,
        location,
        close,
        user,
        isPremium,
        subscription,
    });

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                // setShowPronun(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [setIsOpen]);

    // const openExternal = (url) => { window.open(url, "_blank"); close(); };

    const toggleMenu = () => {
        setIsOpen((open) => !open);
        // setShowPronun(false);
    };

    const changeStudyLanguage = (nextLanguage) => {
        if (nextLanguage !== studyLanguage) {
            setStudyLanguage(nextLanguage);
            void updateStudyLanguage(nextLanguage);
        }
        close();
    };

    return (
        <div className="floatingMenuContainer" ref={containerRef}>
            {mobileTrigger?.({ isOpen, toggleMenu })}

            <button
                type="button"
                className="floatingMainButton"
                onClick={toggleMenu}
                aria-label={language === 'es' ? 'Menú de estudio' : 'Study menu'}
                aria-expanded={isOpen}
                data-tour="menu-estudio"
            >
                <LuEllipsisVertical className="floatingMainButtonIcon" size={24} strokeWidth={2} aria-hidden="true" />
            </button>

            <div className={`floatingOptions ${isOpen ? "show" : ""}`}>

                {moduleFloatingItems.length > 0 && (
                    <>
                        {moduleFloatingItems.map((item, index) => (
                            <React.Fragment key={item.id}>
                                {item.sectionLabel && (index === 0 || moduleFloatingItems[index - 1]?.sectionLabel !== item.sectionLabel) && (
                                    <span className="fmSectionLabel">{item.sectionLabel}</span>
                                )}
                                {/* Un ítem sin onClick es informativo (p. ej. el plan premium activo):
                                    se pinta igual pero no es interactivo. */}
                                <button
                                    className={`floatingOption ${item.onClick ? '' : 'floatingOptionStatic'}`}
                                    onClick={(e) => {
                                        if (item.onClick) {
                                            item.onClick(e);
                                            close();
                                        }
                                    }}
                                    disabled={!item.onClick}
                                    data-tour={item.id === 'flashcards-categories' ? 'catalogo-categorias' : undefined}
                                >
                                    <span className={`optionIcon ${item.iconColor || ''}`}>{item.icon}</span>
                                    <span className="fmOptionText">
                                        <span className="fmOptionName">{item.name}</span>
                                        <span className="fmOptionSub">{item.sub}</span>
                                    </span>
                                </button>
                            </React.Fragment>
                        ))}
                        <div className="fmDivider" />
                    </>
                )}

                {/* Opción "Pronunciación" oculta temporalmente.
                <span className="fmSectionLabel">{t.practice}</span>

                <button
                    className={`floatingOption ${showPronun ? "active" : ""}`}
                    onClick={() => setShowPronun(!showPronun)}
                >
                    <span className="optionIcon brand"><IconPronunciation /></span>
                    <span className="fmOptionText">
                        <span className="fmOptionName">{t.pronunciation}</span>
                        <span className="fmOptionSub">
                            {showPronun ? t.close : t.pronunciationSub}
                        </span>
                    </span>
                </button>

                {showPronun && (
                    <>
                        <button className="floatingOption submenuItem" onClick={() => openExternal(VOWELS_URL)}>
                            <span className="fmOptionText"><span className="fmOptionName">{t.vowels}</span></span>
                        </button>
                        <button className="floatingOption submenuItem" onClick={() => openExternal(DIPHTHONGS_URL)}>
                            <span className="fmOptionText"><span className="fmOptionName">{t.diphthongs}</span></span>
                        </button>
                        <button className="floatingOption submenuItem" onClick={() => openExternal(CONSONANTS_URL)}>
                            <span className="fmOptionText"><span className="fmOptionName">{t.consonants}</span></span>
                        </button>
                    </>
                )}

                <div className="fmDivider" />
                */}

                {/* ── CUENTA ── */}
                <span className="fmSectionLabel">{t.account}</span>

                <div className="mobileInterfaceLanguageControl">
                    <span className="mobileInterfaceLanguageLabel">
                        {language === 'es' ? 'Idioma de la interfaz' : 'Interface language'}
                    </span>
                    <LanguageSelector
                        currentLanguage={language}
                        onLanguageChange={(newLang) => {
                            setLanguage(newLang);
                            close();
                        }}
                        ariaLabel={language === 'es' ? 'Idioma de la interfaz' : 'Interface language'}
                    />
                </div>

                <div className="userProfileItem">
                    {user?.picture
                        ? <img src={user.picture} alt="" className="userAvatar" referrerPolicy="no-referrer" />
                        : <span className="userAvatarFallback">{(user?.name || user?.email || '?').charAt(0).toUpperCase()}</span>
                    }
                    <div className="userInfo">
                        <span className="userName">{user?.name}</span>
                        <span className={`userRole ${isPremium ? 'userRole--premium' : ''}`}>
                            {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Viewer'}
                        </span>
                    </div>
                </div>

                <div className="studyDirectionControl" role="group" aria-label={t.studyDirection}>
                    <span className="studyDirectionLabel">{t.studyDirection}</span>
                    <button
                        type="button"
                        className={`studyDirectionOption ${studyLanguage === 'en' ? 'active' : ''}`}
                        onClick={() => changeStudyLanguage('en')}
                        aria-pressed={studyLanguage === 'en'}
                    >
                        {t.learnEnglish}
                    </button>
                    <button
                        type="button"
                        className={`studyDirectionOption ${studyLanguage === 'es' ? 'active' : ''}`}
                        onClick={() => changeStudyLanguage('es')}
                        aria-pressed={studyLanguage === 'es'}
                    >
                        {t.learnSpanish}
                    </button>
                    <button
                        type="button"
                        className={`studyDirectionOption ${studyLanguage === 'de' ? 'active' : ''}`}
                        onClick={() => changeStudyLanguage('de')}
                        aria-pressed={studyLanguage === 'de'}
                    >
                        {t.learnGerman}
                    </button>
                </div>

                <button
                    className="floatingOption logoutBtn"
                    onClick={() => { logout(); close(); }}
                >
                    <span className="optionIcon red">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </span>
                    <span className="fmOptionText">
                        <span className="fmOptionName">{t.logout}</span>
                    </span>
                </button>

            </div>
        </div>
    );
};

export default FloatingMenu;
