import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CardBack from './CardBack';
import HighlightedText from './HighlightedText';
import ImageViewer from './ImageViewer';

afterEach(() => {
    vi.useRealTimers();
});

describe('CardBack', () => {
    const card = {
        name: 'sleep',
        definitions: [{
            meaning: 'dormir',
            usage_example: 'I sleep here',
            usage_example_es: 'Yo duermo aquí',
            alternative_example: 'They sleep outside',
        }],
        irregular: {
            past: { form: 'slept', usage_example: 'I slept here', usage_example_es: 'Dormí aquí' },
            participle: { form: 'slept', definitions: [{ meaning: 'dormido', usage_example: 'I have slept' }] },
        },
    };

    it('renders meanings, highlighted examples and English alternatives', () => {
        render(<CardBack cardData={card} activeForm="v1" currentLanguage="en" />);
        expect(screen.getByText('dormir')).toBeVisible();
        expect(screen.getByText('sleep', { selector: 'strong' })).toBeVisible();
        expect(screen.getByText(/They sleep outside/)).toBeVisible();
        expect(screen.getByText('Yo duermo aquí')).toBeVisible();
    });

    it('selects irregular past and participle contracts', () => {
        const { rerender } = render(<CardBack cardData={card} activeForm="v2" currentLanguage="en" />);
        expect(screen.getByText(/Pasado de sleep/)).toBeVisible();
        expect(screen.getByText('slept', { selector: 'strong' })).toBeVisible();
        rerender(<CardBack cardData={card} activeForm="v3" currentLanguage="en" />);
        expect(screen.getByText('dormido')).toBeVisible();
        expect(screen.getByText('slept', { selector: 'strong' })).toBeVisible();
    });

    it('hides English-only alternatives while learning Spanish', () => {
        render(<CardBack cardData={card} activeForm="v1" currentLanguage="es" />);
        expect(screen.queryByText(/They sleep outside/)).not.toBeInTheDocument();
        expect(screen.getByText('significa')).toBeVisible();
    });
});

describe('HighlightedText', () => {
    it('highlights only the active word and handles empty text', () => {
        const { container, rerender } = render(
            <HighlightedText text="one two three" activeAudioText="one two three" highlightedWordIndex={1} />,
        );
        expect(container.querySelectorAll('span')).toHaveLength(3);
        expect(screen.getByText('two')).toHaveAttribute('class');
        expect(screen.getByText('one')).not.toHaveAttribute('class');
        rerender(<HighlightedText text="" activeAudioText="" highlightedWordIndex={0} />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('ImageViewer', () => {
    const baseProps = {
        isImageLoading: false,
        isGeneratingImage: false,
        isUploading: false,
        imageRef: { current: null },
        altText: 'coffee scene',
        onDelete: vi.fn(),
        onRegenerate: vi.fn(),
        onUploadClick: vi.fn(),
        onImageError: vi.fn(),
        canCustomizeImages: true,
        canDeleteImages: true,
        isDisabled: false,
        imageKey: 'v1-0',
    };

    it('shows a placeholder and upload/generate actions without an image', () => {
        render(<ImageViewer {...baseProps} imageUrl="" />);
        expect(screen.getByAltText('Image not available')).toBeVisible();
        fireEvent.click(screen.getByTitle('Generar imagen con IA'));
        fireEvent.click(screen.getByTitle('Subir imagen desde el equipo'));
        expect(baseProps.onRegenerate).toHaveBeenCalled();
        expect(baseProps.onUploadClick).toHaveBeenCalled();
    });

    it('loads, reports decode errors and exposes image actions', () => {
        const onError = vi.fn();
        render(<ImageViewer {...baseProps} imageUrl="/card_images/a.avif?v=1" onImageError={onError} />);
        const image = screen.getByAltText('coffee scene');
        expect(image.closest('[data-state]')).toHaveAttribute('data-state', 'loading');
        fireEvent.load(image);
        expect(image.closest('[data-state]')).toHaveAttribute('data-state', 'ready');
        fireEvent.click(screen.getByTitle('Regenerar imagen con IA'));
        fireEvent.click(screen.getByTitle('Eliminar imagen actual'));
        expect(baseProps.onRegenerate).toHaveBeenCalled();
        expect(baseProps.onDelete).toHaveBeenCalled();
        fireEvent.error(image);
        expect(onError).toHaveBeenCalledOnce();
    });

    it('fails closed when image decoding stalls', () => {
        vi.useFakeTimers();
        const onError = vi.fn();
        render(<ImageViewer {...baseProps} imageUrl="/card_images/stalled.avif" onImageError={onError} />);
        vi.advanceTimersByTime(5_000);
        expect(onError).toHaveBeenCalledOnce();
    });
});
