import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioHttpAdapter } from './studyAudioHttpAdapter';
import { createImageHttpAdapter } from './studyImageHttpAdapter';

function httpMock() {
    return {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
        upload: vi.fn(),
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('study audio adapter', () => {
    it('sends the exact resolve-audio payload and forwards cancellation', async () => {
        const http = httpMock();
        http.post.mockResolvedValue({
            audio_url: '/card_audio/demo.mp3',
            voice_name: 'Rachel',
            from_cache: true,
        });
        const adapter = createAudioHttpAdapter(http);
        const controller = new AbortController();

        await expect(adapter.resolve({
            category: 'landing-demo',
            deck: 'verbs-essentials',
            text: 'to be',
            verbName: 'be',
            lang: '',
            courseDirection: 'unknown',
            signal: controller.signal,
        })).resolves.toMatchObject({ audio_url: '/card_audio/demo.mp3' });

        expect(http.post).toHaveBeenCalledWith('/api/resolve-audio', {
            category: 'landing-demo',
            deck: 'verbs-essentials',
            text: 'to be',
            voice_name: '',
            tone: '',
            verb_name: 'be',
            lang: 'en',
            course_direction: 'es_en',
        }, { signal: controller.signal });
    });

    it('maps synthesize controls and preserves en_es', async () => {
        const http = httpMock();
        http.post.mockResolvedValue({ audio_url: '/new.mp3' });
        const adapter = createAudioHttpAdapter(http);

        await adapter.synthesize({
            category: 'landing-demo',
            deck: 'verbs-essentials',
            text: 'went',
            verbName: 'go',
            lang: 'en',
            courseDirection: 'en_es',
            excludeVoice: 'Rachel',
            forceRegenerate: 1,
        });

        expect(http.post).toHaveBeenCalledWith('/api/synthesize-speech', {
            category: 'landing-demo',
            deck: 'verbs-essentials',
            text: 'went',
            voice_name: '',
            tone: '',
            verb_name: 'go',
            lang: 'en',
            course_direction: 'en_es',
            exclude_voice: 'Rachel',
            force_regenerate: true,
        }, { signal: undefined });
    });

    it('maps audio rotation and rejects malformed successful responses', async () => {
        const http = httpMock();
        http.post.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({});
        const adapter = createAudioHttpAdapter(http);

        await adapter.rotate({
            category: 'verbs', deck: 'basic', text: 'go', verbName: 'go', courseDirection: 'en_es',
        });
        expect(http.post).toHaveBeenCalledWith('/api/delete-audio', {
            category: 'verbs',
            deck: 'basic',
            text: 'go',
            voice_name: '',
            tone: '',
            verb_name: 'go',
            lang: 'en',
            course_direction: 'en_es',
        });

        await expect(adapter.resolve({ category: 'x', deck: 'y', text: 'z' }))
            .rejects.toThrow('No audio_url in response');
    });

    it('builds stable URLs and cache-busts only when requested', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234);
        const adapter = createAudioHttpAdapter(httpMock());

        expect(adapter.buildUrl(null)).toBeNull();
        expect(adapter.buildUrl('/card_audio/a.mp3')).toBe('/card_audio/a.mp3');
        expect(adapter.buildUrl('https://cdn.test/a.mp3')).toBe('https://cdn.test/a.mp3');
        expect(adapter.buildUrl('/a.mp3?v=2', true)).toBe('/a.mp3?v=2&t=1234');
    });

    it('preloads the stream and reports empty paths and HTTP errors', async () => {
        const adapter = createAudioHttpAdapter(httpMock());
        const read = vi.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array([1]) })
            .mockResolvedValueOnce({ done: true });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            body: { getReader: () => ({ read }) },
        }));

        await expect(adapter.preload('/card_audio/a.mp3')).resolves.toBe('/card_audio/a.mp3');
        expect(read).toHaveBeenCalledTimes(2);
        await expect(adapter.preload('')).rejects.toThrow('Ruta de audio vacía');

        fetch.mockResolvedValue({ ok: false, status: 404 });
        await expect(adapter.preload('/missing.mp3')).rejects.toThrow('HTTP 404');
    });
});

describe('study image adapter', () => {
    it('sends resolve-image identity and omits the base form', async () => {
        const http = httpMock();
        http.post.mockResolvedValue({ path: '/card_images/demo.avif' });
        const adapter = createImageHttpAdapter(http);

        await adapter.resolve({
            category: 'landing-demo', deck: 'verbs-essentials', index: 1, defIndex: 0, form: 'v1',
        });

        expect(http.post).toHaveBeenCalledWith('/api/resolve-image', {
            category: 'landing-demo',
            deck: 'verbs-essentials',
            index: 1,
            def_index: 0,
            course_direction: 'es_en',
            form: undefined,
        }, { signal: undefined });
    });

    it('maps every generate-image field to the backend contract', async () => {
        const http = httpMock();
        http.post.mockResolvedValue({ path: '/generated.avif' });
        const adapter = createImageHttpAdapter(http);

        await adapter.generate({
            category: 'landing-demo',
            deck: 'verbs-essentials',
            index: 2,
            defIndex: 1,
            form: 'v2',
            courseDirection: 'en_es',
            prompt: 'scene',
            meaning: 'escena',
            usageExample: 'An example',
            usageContext: '',
            alternativeExample: 'Alternative',
            forceGeneration: true,
            legacyImagePath: '',
            sceneComplement: 'sunset',
            promptEngine: 'gemini',
        });

        expect(http.post).toHaveBeenCalledWith('/api/generate-image', {
            category: 'landing-demo',
            deck: 'verbs-essentials',
            index: 2,
            def_index: 1,
            course_direction: 'en_es',
            form: 'v2',
            prompt: 'scene',
            meaning: 'escena',
            usage_example: 'An example',
            usage_context: undefined,
            alternative_example: 'Alternative',
            force_generation: true,
            legacy_image_path: undefined,
            scene_complement: 'sunset',
            prompt_engine: 'gemini',
        }, { signal: undefined });
    });

    it('maps delete-image and preserves backend errors as causes', async () => {
        const http = httpMock();
        http.delete.mockResolvedValueOnce({ success: true }).mockRejectedValueOnce(new Error('HTTP 403'));
        const adapter = createImageHttpAdapter(http);
        const args = {
            category: 'landing-demo', deck: 'verbs-essentials', index: 3, defIndex: 0, form: 'v3',
        };

        await adapter.delete(args);
        expect(http.delete).toHaveBeenCalledWith('/api/delete-image', {
            category: 'landing-demo',
            deck: 'verbs-essentials',
            index: 3,
            def_index: 0,
            form: 'v3',
            course_direction: 'es_en',
        });
        await expect(adapter.delete(args)).rejects.toMatchObject({ message: 'HTTP 403' });
    });

    it('builds upload FormData with exact field names', async () => {
        const http = httpMock();
        http.upload.mockResolvedValue({ path: '/uploaded.avif' });
        const adapter = createImageHttpAdapter(http);
        const file = new File(['image'], 'image.png', { type: 'image/png' });

        await adapter.upload(file, {
            category: 'verbs', deck: 'basic', cardIndex: 4, defIndex: 2, form: 'v2', courseDirection: 'en_es',
        });

        const [path, formData] = http.upload.mock.calls[0];
        expect(path).toBe('/api/upload-image');
        expect(formData.get('file')).toBe(file);
        expect(Object.fromEntries([...formData.entries()].filter(([key]) => key !== 'file'))).toEqual({
            category: 'verbs',
            deck: 'basic',
            card_index: '4',
            def_index: '2',
            course_direction: 'en_es',
            form: 'v2',
        });
    });

    it('rejects success payloads without a path', async () => {
        const http = httpMock();
        http.post.mockResolvedValue({});
        http.upload.mockResolvedValue({});
        const adapter = createImageHttpAdapter(http);

        await expect(adapter.resolve({ category: 'x', deck: 'y', index: 0, defIndex: 0 }))
            .rejects.toThrow('Sin ruta de imagen');
        await expect(adapter.generate({ category: 'x', deck: 'y', index: 0, defIndex: 0, prompt: 'p' }))
            .rejects.toThrow('Sin ruta de imagen');
        await expect(adapter.upload(new File(['x'], 'x.png'), {
            category: 'x', deck: 'y', cardIndex: 0, defIndex: 0,
        })).rejects.toThrow('Sin ruta de imagen en la respuesta de subida');
    });

    it('preloadImage resolves, rejects and aborts without double settlement', async () => {
        const instances = [];
        class FakeImage {
            constructor() {
                instances.push(this);
            }
            set src(value) {
                this._src = value;
            }
            get src() {
                return this._src;
            }
        }
        vi.stubGlobal('Image', FakeImage);
        const adapter = createImageHttpAdapter(httpMock());

        const loaded = adapter.preloadImage('/card_images/image.jpg');
        instances[0].onload();
        await expect(loaded).resolves.toBe('/card_images/image.avif');

        const failed = adapter.preloadImage('/card_images/missing.png');
        instances[1].onerror();
        await expect(failed).rejects.toThrow('/card_images/missing.avif');

        const controller = new AbortController();
        const aborted = adapter.preloadImage('/slow.png', false, { signal: controller.signal });
        controller.abort();
        await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
        expect(instances[2].src).toBe('');
    });
});
