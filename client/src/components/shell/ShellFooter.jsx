import React from 'react';
import './ShellFooter.css';

const DEFAULT_LABELS = {
    documentation: 'Documentation',
    portfolio: 'Portfolio',
    github: 'GitHub',
};

// `labels` sigue en la firma porque LandingPage, LoginPage y PricingPage lo pasan traducido: hoy no
// se usa (el bloque de links está desactivado más abajo), pero quitarlo obligaría a tocar los tres
// llamadores para volver a ponerlo al reactivar los links.
export default function ShellFooter({ variant = 'app', labels: _labels = DEFAULT_LABELS }) {
    return (
        <footer className={`shell-footer shell-footer--${variant}`}>
            <div className="shell-footer-content">
                <div className="shell-footer-info">
                    <div className="shell-footer-brand">
                        <img src="/logo.avif" alt="" className="shell-footer-logo" />
                        <div className="shell-footer-meta">
                            <p className="shell-footer-copyright">&copy; 2026 by TheRuby.</p>
                            <p className="shell-footer-version">Version 1.0.0-Beta</p>
                        </div>
                    </div>
                </div>
                {/* Al reactivar este bloque, restaurar `const copy = { ...DEFAULT_LABELS, ...labels };`
                    arriba — es lo único que consumía la prop `labels`.
                <div className="shell-footer-links">
                    <a href="/documentation" className="shell-footer-link">{copy.documentation}</a>
                    <span className="shell-footer-divider">|</span>
                    <a
                        href="https://www.fluency.lat/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shell-footer-link"
                    >
                        {copy.portfolio}
                    </a>
                    <span className="shell-footer-divider">|</span>
                    <a
                        href="https://github.com/jcoronado1982/fluency.lat"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shell-footer-link"
                    >

                        {copy.github}
                    </a>
                </div> */}
            </div>
        </footer>
    );
}
