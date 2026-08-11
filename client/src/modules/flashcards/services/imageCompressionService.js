import init, { encode_avif } from './wasm_lib.js';
import heic2any from 'heic2any';

let wasmLoaded = false;

// Inicialización asíncrona segura de WASM
async function loadWasm() {
    if (wasmLoaded) return;
    try {
        await init();
        wasmLoaded = true;
    } catch (e) {
        console.error('[WASM Compresor] Error crítico al cargar el módulo:', e);
    }
}

// Inicializar de fondo
loadWasm().catch(console.error);

export const imageCompressionService = {
    /**
     * Comprime y optimiza un archivo de imagen en el cliente.
     * Convierte HEIC -> JPEG si es necesario, escala a un tamaño exacto de 768x512px
     * usando un reescalado tipo "cover" (centrado y recortando sobrantes para mantener la proporción),
     * y comprime a formato AVIF usando el motor WebAssembly (WASM).
     * 
     * @param {File} file Archivo original a comprimir
     * @param {number} [quality=0.80] Calidad de compresión (0.0 a 1.0)
     * @returns {Promise<Blob>} Blob comprimido en formato AVIF
     */
    compress: async (file, quality = 0.80) => {
        let currentFile = file;

        // 1. Conversión de HEIC si es necesario
        if (file.name.toLowerCase().endsWith('.heic')) {
            try {
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: 'image/jpeg',
                    quality: 0.85
                });
                const singleBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                currentFile = new File([singleBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: "image/jpeg" });
            } catch (e) {
                console.error('[Compresor] Fallo al convertir HEIC:', e);
                throw new Error('No se pudo decodificar el archivo HEIC.', { cause: e });
            }
        }

        // Aseguramos que el WASM esté cargado
        await loadWasm();

        // 2. Cargar imagen en un Canvas para reescalar a 768x512
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = async () => {
                    try {
                        const canvas = document.createElement('canvas');
                        
                        // Tamaño canónico y estándar de las flashcards: 768x512
                        const targetWidth = 768;
                        const targetHeight = 512;
                        canvas.width = targetWidth;
                        canvas.height = targetHeight;

                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error('No se pudo obtener contexto 2D del Canvas.');
                        
                        // Lógica de escalado "cover" para mantener la proporción sin deformar
                        const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
                        const x = (targetWidth - img.width * scale) / 2;
                        const y = (targetHeight - img.height * scale) / 2;
                        
                        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

                        // 3. Codificación estándar por software con WebAssembly (Rust Engine)
                        if (!wasmLoaded) {
                            throw new Error('El motor de compresión WebAssembly (AVIF/WASM) no cargó correctamente.');
                        }

                        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                        const rgbaData = new Uint8Array(imageData.data.buffer);
                        const qualityPercentage = Math.round(quality * 100);

                        const avifBytes = encode_avif(rgbaData, targetWidth, targetHeight, qualityPercentage);
                        const avifBlob = new Blob([avifBytes], { type: 'image/avif' });
                        resolve(avifBlob);

                    } catch (err) {
                        console.error('[Compresor] Error crítico durante la compresión:', err);
                        reject(new Error(`Error al comprimir a AVIF: ${err.message}`));
                    }
                };
                img.onerror = () => reject(new Error('Fallo al cargar imagen para procesamiento.'));
                img.src = event.target.result;
            };
            reader.onerror = () => reject(new Error('Fallo al leer el archivo de imagen.'));
            reader.readAsDataURL(currentFile);
        });
    }
};
