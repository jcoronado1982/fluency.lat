import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Controls from './Controls';

const session = {
    prevCard: vi.fn(),
    nextCard: vi.fn(),
    markAsLearned: vi.fn(),
    resetDeck: vi.fn(),
    currentIndex: 1,
    filteredData: [{ id: 1 }, { id: 2 }, { id: 3 }],
    currentDeckName: '01_basic-verbs',
    isLandingDemo: false,
};

vi.mock('../../../context/UIContext', () => ({ useUIContext: () => ({ language: 'en' }) }));
vi.mock('../context/flashcardStudyContext', () => ({ useFlashcardContext: () => session }));

beforeEach(() => {
    vi.clearAllMocks();
    session.filteredData = [{ id: 1 }, { id: 2 }, { id: 3 }];
    session.currentDeckName = '01_basic-verbs';
});

describe('Controls', () => {
    it('executes navigation, learning and reset actions', () => {
        render(<Controls />);
        expect(screen.getByText('2 / 3')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Correct' }));
        fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
        expect(session.prevCard).toHaveBeenCalledOnce();
        expect(session.nextCard).toHaveBeenCalledOnce();
        expect(session.markAsLearned).toHaveBeenCalledOnce();
        expect(session.resetDeck).toHaveBeenCalledOnce();
    });

    it('supports arrows but ignores editable targets and active onboarding', () => {
        const { container } = render(<Controls />);
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(session.prevCard).toHaveBeenCalledOnce();
        expect(session.nextCard).toHaveBeenCalledOnce();

        const input = document.createElement('input');
        container.appendChild(input);
        fireEvent.keyDown(input, { key: 'ArrowRight' });
        expect(session.nextCard).toHaveBeenCalledOnce();

        const tour = document.createElement('div');
        tour.dataset.onboardingTour = 'true';
        document.body.appendChild(tour);
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(session.nextCard).toHaveBeenCalledOnce();
        tour.remove();
    });

    it('disables study controls when there are no cards', () => {
        session.filteredData = [];
        session.currentDeckName = '';
        render(<Controls />);
        expect(screen.getByText('0 / 0')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Correct' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
    });
});
