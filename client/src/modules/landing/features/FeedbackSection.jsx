import React from 'react';
import DemoFeedback from './DemoFeedback';

/**
 * FeedbackSection — sección de comentarios/valoraciones de la landing.
 * SRP: solo el marco de la sección (id "reviews" para el nav); el contenido
 * vive en DemoFeedback.
 */
export default function FeedbackSection({ language }) {
    return (
        <section className="lp-feedback-section" id="reviews">
            <div className="lp-section-inner">
                <DemoFeedback language={language} />
            </div>
        </section>
    );
}
