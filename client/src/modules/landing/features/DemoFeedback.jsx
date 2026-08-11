import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCheck, FiMessageSquare } from 'react-icons/fi';
import { useAuth } from '../../../context/AuthContext';
import { demoFeedbackPort } from '../composition';
import {
    clearDemoFeedbackReturn,
    consumeDemoFeedbackDraft,
    hasDemoFeedbackReturn,
    saveDemoFeedbackDraft,
} from '../../../utils/demoFeedbackStorage';
import { StarRatingDisplay, StarRatingInput } from './StarRating';

function formatReviewDateTime(iso, isEs) {
    if (!iso) return '';
    try {
        return new Intl.DateTimeFormat(isEs ? 'es' : 'en', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(iso));
    } catch {
        return '';
    }
}

function formatCountry(value, isEs) {
    if (!value) return '';
    const trimmed = value.trim();
    if (trimmed.length === 2) {
        try {
            const label = new Intl.DisplayNames([isEs ? 'es' : 'en'], { type: 'region' })
                .of(trimmed.toUpperCase());
            return label || trimmed;
        } catch {
            return trimmed;
        }
    }
    return trimmed;
}

function reviewInitials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return (parts[0]?.[0] || '?').toUpperCase();
}

function fallbackHandle(name) {
    const slug = (name || 'user')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 18);
    return `@${slug || 'user'}`;
}

function ReviewAvatar({ name, picture }) {
    if (picture) {
        return (
            <img
                className="lp-social-card__avatar"
                src={picture}
                alt=""
                width={44}
                height={44}
                loading="lazy"
                referrerPolicy="no-referrer"
            />
        );
    }
    return (
        <span className="lp-social-card__avatar lp-social-card__avatar--fallback" aria-hidden>
            {reviewInitials(name)}
        </span>
    );
}

function GoogleMark() {
    return (
        <svg className="lp-social-card__source" viewBox="0 0 24 24" aria-hidden>
            <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
        </svg>
    );
}

function ReviewCard({ review, isEs }) {
    const handle = review.user_handle || fallbackHandle(review.user_name);
    const country = formatCountry(review.country, isEs);
    const when = formatReviewDateTime(review.created_at, isEs);
    const subParts = [handle, country, when].filter(Boolean);
    const isGoogleUser = Boolean(review.picture);

    return (
        <article className="lp-social-card">
            <header className="lp-social-card__header">
                <ReviewAvatar name={review.user_name} picture={review.picture} />
                <div className="lp-social-card__who">
                    <div className="lp-social-card__name-row">
                        <span className="lp-social-card__name">{review.user_name}</span>
                        {isGoogleUser && (
                            <span className="lp-social-card__verified" title="Google" aria-label="Google">
                                <svg viewBox="0 0 24 24" aria-hidden>
                                    <path
                                        fill="currentColor"
                                        d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                                    />
                                </svg>
                            </span>
                        )}
                    </div>
                    {subParts.length > 0 && (
                        <p className="lp-social-card__sub">{subParts.join(' · ')}</p>
                    )}
                </div>
                {isGoogleUser ? <GoogleMark /> : (
                    <img className="lp-social-card__brand" src="/logo.avif" alt="" />
                )}
            </header>
            <p className="lp-social-card__text">{review.comment}</p>
            <div className="lp-social-card__rating">
                <StarRatingDisplay value={review.rating} size="sm" />
            </div>
            <time className="lp-social-card__sr" dateTime={review.created_at}>
                {when}
            </time>
        </article>
    );
}

function ReviewsScrollColumn({ reviews, durationSec, isEs, stagger = 0, reverse = false }) {
    if (!reviews.length) return null;

    // La segunda copia es el clon del loop infinito (translateY -50% exacto,
    // linear: sin salto al reiniciar). buildReviewColumns garantiza ≥3 tarjetas
    // por columna, que junto a la altura mínima del CSS cubren el viewport.
    const track = [...reviews, ...reviews];

    return (
        <div className="lp-reviews-scroll-col">
            <div
                className="lp-reviews-scroll-track"
                style={{
                    '--scroll-duration': `${durationSec}s`,
                    '--scroll-direction': reverse ? 'reverse' : 'normal',
                    '--col-stagger': `${stagger}px`,
                }}
            >
                {track.map((review, index) => (
                    <ReviewCard
                        key={`${review.created_at}-${review.user_name}-${index}`}
                        review={review}
                        isEs={isEs}
                    />
                ))}
            </div>
        </div>
    );
}

// El muro está siempre animado, así que con pocos reviews la repetición es
// inevitable; estas reglas la hacen ver intencional:
// - Con ≥9 reviews: reparto round-robin disjunto (nada se repite en pantalla).
// - Con <9: cada columna lleva la lista COMPLETA rotada por un offset distinto
//   (col 1: A,B,C,D / col 2: B,C,D,A / col 3: C,D,A,B), repetida hasta tener
//   ≥3 tarjetas. Así el mismo review nunca va dos veces seguidas en una columna
//   (para n≥2) ni arranca a la misma altura en dos columnas vecinas; las
//   velocidades y offsets distintos por columna rompen el patrón en movimiento.
function buildReviewColumns(reviews, columnCount = 3) {
    const n = reviews.length;

    if (n >= columnCount * 3) {
        const columns = Array.from({ length: columnCount }, () => []);
        reviews.forEach((review, index) => {
            columns[index % columnCount].push(review);
        });
        return columns;
    }

    const rotationStep = Math.max(1, Math.floor(n / columnCount));
    return Array.from({ length: columnCount }, (_, columnIndex) => {
        const offset = (columnIndex * rotationStep) % n;
        const rotated = [...reviews.slice(offset), ...reviews.slice(0, offset)];
        const column = [...rotated];
        while (column.length < 3) {
            column.push(...rotated);
        }
        return column;
    });
}
function DemoFeedbackEmptyState({ language }) {
    const isEs = language === 'es';
    const copy = {
        title: isEs ? 'Qué dicen después de probar Fluency' : 'What people say after trying Fluency',
        emptyTitle: isEs ? '¡Aún no hay opiniones!' : 'No reviews yet!',
        emptyDesc: isEs 
            ? 'Sé la primera persona en compartir su experiencia probando la aplicación.' 
            : 'Be the first person to share your experience trying the application.',
        cta: isEs ? 'Deja tu opinión en el formulario de abajo 👇' : 'Leave your feedback in the form below 👇',
    };

    return (
        <div className="lp-reviews-wall lp-reviews-wall--empty-state">
            <div className="lp-reviews-wall-header">
                <h3 className="lp-reviews-wall-title">{copy.title}</h3>
            </div>
            <div className="lp-reviews-empty-card">
                <div className="lp-reviews-empty-glow" />
                <div className="lp-reviews-empty-icon-wrap">
                    <FiMessageSquare className="lp-reviews-empty-icon" />
                </div>
                <h4 className="lp-reviews-empty-title">{copy.emptyTitle}</h4>
                <p className="lp-reviews-empty-desc">{copy.emptyDesc}</p>
                <div className="lp-reviews-empty-badge">
                    <span>{copy.cta}</span>
                </div>
            </div>
        </div>
    );
}

function DemoFeedbackReviews({ reviews, summary, language }) {
    const isEs = language === 'es';
    const hasNoReviews = !reviews || reviews.length === 0;

    if (hasNoReviews) {
        return <DemoFeedbackEmptyState language={language} />;
    }

    const copy = {
        title: isEs ? 'Qué dicen después de probar Fluency' : 'What people say after trying Fluency',
        count: (n) => {
            if (isEs) return `${n} ${n === 1 ? 'calificación' : 'calificaciones'}`;
            return `${n} ${n === 1 ? 'rating' : 'ratings'}`;
        },
        outOf: isEs ? 'de 5' : 'out of 5',
    };

    const columns = buildReviewColumns(reviews, 3);
    // Lento y flotante a propósito: no debe sentirse como un feed que corre.
    const durations = [60, 75, 68];
    const staggers = [0, -60, -120];
    const reversedColumns = [false, true, false];

    return (
        <div className="lp-reviews-wall">
            <div className="lp-reviews-wall-header">
                <div className="lp-reviews-wall-heading">
                    <h3 className="lp-reviews-wall-title">{copy.title}</h3>
                    <div className="lp-reviews-wall-summary">
                        <span className="lp-reviews-wall-average">{summary.average.toFixed(1)}</span>
                        <StarRatingDisplay
                            value={summary.average}
                            size="md"
                            label={`${summary.average} de 5`}
                        />
                        <span className="lp-reviews-wall-count">
                            {copy.count(summary.count)} · {copy.outOf}
                        </span>
                    </div>
                </div>
            </div>

            <div className="lp-reviews-wall-viewport">
                {columns.map((columnReviews, index) => (
                    <ReviewsScrollColumn
                        key={`col-${index}`}
                        reviews={columnReviews}
                        durationSec={durations[index]}
                        stagger={staggers[index]}
                        reverse={reversedColumns[index]}
                        isEs={isEs}
                    />
                ))}
            </div>
        </div>
    );
}

const COMMENT_MAX_LENGTH = 500;

export default function DemoFeedback({ language }) {
    const { isAuthenticated, user, logout } = useAuth();
    const navigate = useNavigate();
    const [comment, setComment] = useState('');
    const [rating, setRating] = useState(0);
    const [status, setStatus] = useState('idle');
    const [authError, setAuthError] = useState(false);
    const [reviews, setReviews] = useState([]);
    const [summary, setSummary] = useState({ average: 0, count: 0 });
    const isEs = language === 'es';

    const copy = {
        label: isEs ? '¿Qué te pareció Fluency?' : 'How was your experience?',
        sub: isEs
            ? 'Prueba el demo rápido o usa la app, luego deja una calificación y cuéntanos qué te gustó o qué mejorarías.'
            : 'Try the quick demo or use the app, then leave a rating and tell us what you liked or what you would improve.',
        ratingLabel: isEs ? 'Tu calificación' : 'Your rating',
        ratingRequired: isEs ? 'Elige de 1 a 5 estrellas' : 'Choose 1 to 5 stars',
        starLabels: isEs
            ? { 1: '1 estrella — Muy malo', 2: '2 estrellas — Malo', 3: '3 estrellas — Regular', 4: '4 estrellas — Bueno', 5: '5 estrellas — Excelente' }
            : { 1: '1 star — Terrible', 2: '2 stars — Poor', 3: '3 stars — Average', 4: '4 stars — Good', 5: '5 stars — Excellent' },
        authHint: isEs
            ? 'Inicia sesión con Google para dejar tu comentario. No necesitas contraseña.'
            : 'Sign in with Google to leave your comment. No password required.',
        loginCta: isEs ? 'Dejar comentario' : 'Leave feedback',
        placeholder: isEs ? '¿Qué te gustó? ¿Qué mejorarías?' : 'What did you like? What would you improve?',
        submit: isEs ? 'Dejar comentario' : 'Leave feedback',
        sending: isEs ? 'Enviando…' : 'Sending…',
        thanks: isEs ? '¡Gracias! Tu comentario ya está publicado.' : 'Thanks! Your review is now live.',
        signOut: isEs ? 'Cerrar sesión' : 'Sign out',
        error: isEs
            ? 'No se pudo enviar. Inténtalo de nuevo en un momento.'
            : "Couldn't send it. Please try again in a moment.",
        authError: isEs
            ? 'Tu sesión expiró. Inicia sesión de nuevo para publicar.'
            : 'Your session expired. Sign in again to submit.',
        signedInAs: isEs ? 'Conectado como' : 'Signed in as',
    };

    const loadReviews = useCallback(async () => {
        try {
            const data = await demoFeedbackPort.fetchRecent(20);
            const sorted = [...(data.reviews || [])].sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at),
            );
            if (import.meta.env.DEV) {
                console.info('[feedback audit] GET /api/demo-feedback', {
                    received: sorted.length,
                    summary: data.summary,
                });
            }
            setReviews(sorted);
            setSummary(data.summary || { average: 0, count: 0 });
        } catch (error) {
            // No convertir un fallo de API en "no hay comentarios": durante
            // desarrollo eso ocultaba que la recarga estaba consultando otro
            // backend o que el backend no estaba disponible.
            console.error('No se pudieron cargar los comentarios de la landing:', error);
            setReviews([]);
        }
    }, []);

    useEffect(() => {
        loadReviews();
    }, [loadReviews]);

    const submitFeedback = useCallback(async (text, ratingValue) => {
        setAuthError(false);
        setStatus('sending');
        try {
            const result = await demoFeedbackPort.submit({ comment: text, rating: ratingValue, language });
            if (import.meta.env.DEV) {
                console.info('[feedback audit] POST /api/demo-feedback', result);
            }
            setStatus('sent');
            setComment('');
            setRating(0);
            clearDemoFeedbackReturn();
            await loadReviews();
        } catch (err) {
            const msg = err?.message || '';
            if (msg.includes('401') || msg.includes('403')) {
                setAuthError(true);
            }
            setStatus('error');
        }
    }, [language, loadReviews]);

    // Solo autoenvía si el usuario fue a /login DESDE este formulario (flag propio
    // de este flujo, nunca por un login "normal" sin intención de comentar).
    useEffect(() => {
        if (!isAuthenticated || !hasDemoFeedbackReturn()) return;
        const draft = consumeDemoFeedbackDraft();
        const text = draft.comment.trim();
        if (text && draft.rating) {
            setComment(text);
            setRating(draft.rating);
            submitFeedback(text, draft.rating);
        } else {
            clearDemoFeedbackReturn();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]);

    const goToLoginForFeedback = () => {
        saveDemoFeedbackDraft({ comment: comment.trim(), rating });
        navigate('/login', { state: { demoFeedbackReturn: true } });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const text = comment.trim();
        if (!text || !rating || status === 'sending') return;

        if (!isAuthenticated) {
            goToLoginForFeedback();
            return;
        }

        await submitFeedback(text, rating);
    };

    const canSubmit = Boolean(comment.trim() && rating);

    useEffect(() => {
        if (status !== 'sent') return undefined;
        const timer = setTimeout(() => setStatus('idle'), 4000);
        return () => clearTimeout(timer);
    }, [status]);

    return (
        <div className="lp-demo-feedback-wrap">
            <DemoFeedbackReviews
                reviews={reviews}
                summary={summary}
                language={language}
            />

            <form className="lp-demo-feedback" onSubmit={handleSubmit}>
                <div className="lp-demo-feedback-head">
                    <span className="lp-demo-feedback-label">{copy.label}</span>
                    <p className="lp-demo-feedback-sub">{copy.sub}</p>
                </div>

                {status === 'sent' && (
                    <div className="lp-demo-feedback-toast" role="status">
                        <FiCheck aria-hidden />
                        <span>{copy.thanks}</span>
                    </div>
                )}

                {!isAuthenticated && (
                    <button
                        type="button"
                        className="lp-demo-feedback-auth-hint"
                        onClick={goToLoginForFeedback}
                    >
                        {copy.authHint}
                    </button>
                )}

                {isAuthenticated && user?.email && (
                    <div className="lp-demo-feedback-user">
                        <ReviewAvatar name={user.name || user.email} picture={user.picture} />
                        <span>
                            {copy.signedInAs}{' '}
                            <strong>{user.name || user.email}</strong>
                        </span>
                        <button
                            type="button"
                            className="lp-demo-feedback-signout"
                            onClick={logout}
                        >
                            {copy.signOut}
                        </button>
                    </div>
                )}

                <div className="lp-demo-feedback-rating-row">
                    <span className="lp-demo-feedback-rating-label">{copy.ratingLabel}</span>
                    <StarRatingInput
                        value={rating}
                        onChange={(v) => { setRating(v); if (status === 'sent') setStatus('idle'); }}
                        size="lg"
                        labels={copy.starLabels}
                    />
                    {!rating && (
                        <span className="lp-demo-feedback-rating-hint">{copy.ratingRequired}</span>
                    )}
                </div>

                <div className="lp-demo-feedback-input-wrap">
                    <textarea
                        className="lp-demo-feedback-input"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={copy.placeholder}
                        rows={2}
                        maxLength={COMMENT_MAX_LENGTH}
                    />
                    <span className="lp-demo-feedback-counter" aria-hidden>
                        {comment.length}/{COMMENT_MAX_LENGTH}
                    </span>
                </div>

                <div className="lp-demo-feedback-row">
                    {status === 'error' && (
                        <span className="lp-demo-feedback-error">
                            {authError ? copy.authError : copy.error}
                        </span>
                    )}
                    {isAuthenticated ? (
                        <button
                            type="submit"
                            className="lp-demo-feedback-submit"
                            disabled={!canSubmit || status === 'sending'}
                        >
                            {status === 'sending' ? copy.sending : copy.submit}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="lp-demo-feedback-submit"
                            onClick={goToLoginForFeedback}
                            disabled={!canSubmit}
                        >
                            {copy.loginCta}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
