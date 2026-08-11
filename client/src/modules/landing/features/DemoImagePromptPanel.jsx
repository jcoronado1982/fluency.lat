import React, { useState } from 'react';
import { FiSliders } from 'react-icons/fi';

/**
 * DemoImagePromptPanel — input para personalizar el prompt de imagen del demo.
 * SRP: solo maneja el texto del prompt y notifica "aplicar"; no conoce la
 * sesión demo ni la generación de imágenes.
 */
export default function DemoImagePromptPanel({ promptRef, onApply, t, collapsible = false }) {
    const [value, setValue] = useState('');
    const [open, setOpen] = useState(false);

    const syncRef = (next) => {
        promptRef.current = next;
    };

    const handleApply = () => {
        syncRef(value);
        onApply();
    };

    const form = (
        <>
            <div className="lp-demo-prompt-row">
                <input
                    id="demo-image-prompt"
                    type="text"
                    className="lp-demo-prompt-input"
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        syncRef(e.target.value);
                    }}
                    placeholder={t.demoImagePromptPlaceholder}
                    autoComplete="off"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleApply();
                        }
                    }}
                />
                <button
                    type="button"
                    className="lp-demo-prompt-apply"
                    onClick={handleApply}
                >
                    {t.demoImagePromptApply}
                </button>
            </div>
            <p className="lp-demo-prompt-hint">{t.demoImagePromptHint}</p>
        </>
    );

    if (collapsible) {
        return (
            <div className={`lp-demo-prompt lp-demo-prompt--card ${open ? 'is-open' : ''}`}>
                <button
                    type="button"
                    className="lp-demo-prompt-toggle"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    aria-controls="demo-image-prompt-panel"
                >
                    <FiSliders aria-hidden />
                    <span>{t.demoImagePromptLabel}</span>
                </button>
                {open && (
                    <div id="demo-image-prompt-panel" className="lp-demo-prompt-body">
                        {form}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="lp-demo-prompt">
            <label className="lp-demo-prompt-label" htmlFor="demo-image-prompt">
                {t.demoImagePromptLabel}
            </label>
            {form}
        </div>
    );
}
