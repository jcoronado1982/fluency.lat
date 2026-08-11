import React from 'react';
import './ShellFooter.css';

const DEFAULT_LABELS = {
    documentation: 'Documentation',
    portfolio: 'Portfolio',
    github: 'GitHub',
};

export default function ShellFooter({ variant = 'app', labels = DEFAULT_LABELS }) {
    const copy = { ...DEFAULT_LABELS, ...labels };

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
                {/* <div className="shell-footer-links">
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
