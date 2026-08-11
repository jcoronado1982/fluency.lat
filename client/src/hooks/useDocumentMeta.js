import { useEffect } from 'react';

function setMetaDescription(content) {
    if (!content) return;
    let el = document.head.querySelector('meta[name="description"]');
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', 'description');
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

/**
 * Sincroniza document.title / meta description / html[lang] con el idioma
 * activo de la página pública actual. Google renderiza el DOM final (a
 * diferencia de bots que solo leen el HTML estático de index.html), así que
 * esto cuenta para indexación y no solo para la pestaña del navegador.
 */
export default function useDocumentMeta({ title, description, lang }) {
    useEffect(() => {
        if (title) document.title = title;
        setMetaDescription(description);
        if (lang) document.documentElement.lang = lang;
    }, [title, description, lang]);
}
