import React from 'react';
import './Layout.css';
import FloatingMenu from './FloatingMenu';
import { LuMenu } from 'react-icons/lu';
import LanguageSelector from '../../../components/common/LanguageSelector';
import { useAppContext } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';

const AppLogo = () => (
    <div className="app-logo">
        <img src="/logo.avif" alt="Fluency" className="app-logo-img" />
        <span className="app-brand-name">Fluency</span>
    </div>
);

function UserAvatar({ user, onClick, language }) {
    const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();
    return (
        <button
            type="button"
            className="header-user-avatar"
            onClick={onClick}
            aria-label={language === 'es' ? 'Abrir menú de cuenta' : 'Open account menu'}
        >
            {user?.picture ? (
                <img src={user.picture} alt="" className="header-user-avatar-img" referrerPolicy="no-referrer" />
            ) : (
                <span className="header-user-avatar-fallback">{initial}</span>
            )}
        </button>
    );
}

/** Saludo de la cabecera PWA (patrón "título grande" nativo). Solo se
 *  muestra en modo standalone vía CSS (.pwa-header-greeting). */
function PwaGreeting({ user, language }) {
    const firstName = (user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '').trim();
    const rawDate = new Date().toLocaleDateString(language === 'es' ? 'es' : 'en', {
        weekday: 'long', day: 'numeric', month: 'long',
    });
    const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
    const title = language === 'es'
        ? (firstName ? `Hola, ${firstName}` : 'Hola')
        : (firstName ? `Hi, ${firstName}` : 'Hi');
    return (
        <div className="pwa-header-greeting">
            <span className="pwa-greeting-title">{title}</span>
            <span className="pwa-greeting-sub">{dateLabel}</span>
        </div>
    );
}

export default function Header() {
    const {
        isSidebarOpen, setIsSidebarOpen,
        language, setLanguage,
        isHeaderManualOpen,
        isHeaderSuppressed,
    } = useAppContext();
    const { user } = useAuth();

    if (isHeaderSuppressed) {
        return null;
    }

    return (
        <header className={`app-header ${isSidebarOpen ? 'sidebar-open' : ''} ${isHeaderManualOpen ? 'manual-open' : ''}`}>
            <div className="header-left">
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="hamburger-btn"
                    data-tour="menu-hamburguesa"
                    aria-label={language === 'es' ? 'Abrir menú lateral' : 'Open side menu'}
                    aria-expanded={isSidebarOpen}
                >
                    <LuMenu size={24} color="#ffffff" />
                </button>
                <AppLogo />
                <PwaGreeting user={user} language={language} />
            </div>

            <div className="header-controls">
                <div className="language-selector-wrapper">
                    <LanguageSelector
                        currentLanguage={language}
                        onLanguageChange={setLanguage}
                        ariaLabel={language === 'es' ? 'Idioma de la interfaz' : 'Interface language'}
                    />
                </div>
                <div className="header-account">
                    <FloatingMenu
                        mobileTrigger={({ toggleMenu }) => (
                            <UserAvatar
                                user={user}
                                language={language}
                                onClick={toggleMenu}
                            />
                        )}
                    />
                </div>
            </div>
        </header>
    );
}
