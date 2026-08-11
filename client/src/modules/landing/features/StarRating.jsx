import React, { useState } from 'react';

const STAR = '★';

function starFill(index, value) {
    const v = Math.min(5, Math.max(0, value));
    if (index <= Math.floor(v)) return 1;
    if (index === Math.ceil(v) && v % 1 >= 0.25) return v % 1;
    return 0;
}

export function StarRatingDisplay({ value = 0, size = 'sm', label }) {
    const stars = [1, 2, 3, 4, 5];
    return (
        <div
            className={`lp-stars lp-stars--${size}`}
            role="img"
            aria-label={label || `${value} de 5 estrellas`}
        >
            {stars.map((n) => {
                const fill = starFill(n, value);
                return (
                    <span
                        key={n}
                        className={`lp-star ${fill >= 1 ? 'is-full' : fill > 0 ? 'is-partial' : ''}`}
                        style={fill > 0 && fill < 1 ? { '--star-fill': `${fill * 100}%` } : undefined}
                        aria-hidden
                    >
                        {STAR}
                    </span>
                );
            })}
        </div>
    );
}

export function StarRatingInput({ value, onChange, size = 'lg', labels }) {
    const [hover, setHover] = useState(0);
    const active = hover || value;

    return (
        <div
            className={`lp-stars lp-stars--input lp-stars--${size}`}
            role="radiogroup"
            aria-label="Calificación"
            onMouseLeave={() => setHover(0)}
        >
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={value === n}
                    aria-label={labels?.[n] || `${n} estrellas`}
                    className={`lp-star-btn ${n <= active ? 'is-active' : ''}`}
                    onMouseEnter={() => setHover(n)}
                    onFocus={() => setHover(n)}
                    onBlur={() => setHover(0)}
                    onClick={() => onChange(n)}
                >
                    {STAR}
                </button>
            ))}
        </div>
    );
}
