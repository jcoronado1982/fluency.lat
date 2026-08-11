/**
 * Normaliza extensiones legacy sin perder la query de versionado ni el fragmento.
 * `?v=` forma parte de la identidad de caché; eliminarlo puede dejar un asset viejo
 * en navegador/CDN aunque el archivo en disco ya haya cambiado.
 */
export function normalizeCardImageUrl(value) {
    if (!value) return value;

    const input = String(value);
    const suffixIndex = input.search(/[?#]/);
    const pathname = suffixIndex >= 0 ? input.slice(0, suffixIndex) : input;
    const suffix = suffixIndex >= 0 ? input.slice(suffixIndex) : '';

    if (!pathname.includes('/card_images/')) return input;
    return `${pathname.replace(/\.(jpe?g|png|webp)$/i, '.avif')}${suffix}`;
}
