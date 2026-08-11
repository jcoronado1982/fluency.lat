import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DemoFeedback from './DemoFeedback';

const mocks = vi.hoisted(() => ({
    auth: {
        isAuthenticated: false,
        user: null,
        logout: vi.fn(),
    },
    navigate: vi.fn(),
    fetchRecent: vi.fn(),
    submit: vi.fn(),
    clearReturn: vi.fn(),
    consumeDraft: vi.fn(),
    saveDraft: vi.fn(),
    hasReturn: vi.fn(),
}));

vi.mock('../../../context/AuthContext', () => ({
    useAuth: () => mocks.auth,
}));

vi.mock('../composition', () => ({
    demoFeedbackPort: {
        fetchRecent: mocks.fetchRecent,
        submit: mocks.submit,
    },
}));

vi.mock('../../../utils/demoFeedbackStorage', () => ({
    clearDemoFeedbackReturn: mocks.clearReturn,
    consumeDemoFeedbackDraft: mocks.consumeDraft,
    saveDemoFeedbackDraft: mocks.saveDraft,
    hasDemoFeedbackReturn: mocks.hasReturn,
}));

vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => mocks.navigate,
}));

const emptyResponse = { summary: { average: 0, count: 0 }, reviews: [] };

beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;
    mocks.consumeDraft.mockReturnValue({ comment: '', rating: 0 });
    mocks.hasReturn.mockReturnValue(false);
    mocks.fetchRecent.mockResolvedValue(emptyResponse);
    mocks.submit.mockResolvedValue({ success: true });
});

describe('DemoFeedback user flow', () => {
    it('loads reviews, sorts newest first and renders the backend summary', async () => {
        mocks.fetchRecent.mockResolvedValue({
            summary: { average: 4.5, count: 2 },
            reviews: [
                { user_name: 'Old', comment: 'Old review', rating: 4, created_at: '2026-01-01T00:00:00Z' },
                { user_name: 'New', comment: 'New review', rating: 5, created_at: '2026-01-02T00:00:00Z' },
            ],
        });

        render(<DemoFeedback language="en" />);

        await waitFor(() => expect(mocks.fetchRecent).toHaveBeenCalledWith(20));
        expect(screen.getByText('4.5')).toBeVisible();
        expect(screen.getByText('2 ratings · out of 5')).toBeVisible();
        const cards = document.querySelectorAll('.lp-social-card__text');
        expect(cards[0]).toHaveTextContent('New review');
    });

    it('keeps an unauthenticated draft and navigates to login', async () => {
        render(<DemoFeedback language="en" />);
        await screen.findByText('No reviews yet!');

        fireEvent.change(screen.getByPlaceholderText('What did you like? What would you improve?'), {
            target: { value: '  Very useful  ' },
        });
        fireEvent.click(screen.getByRole('radio', { name: '5 stars — Excellent' }));
        fireEvent.click(screen.getByRole('button', { name: 'Leave feedback' }));

        expect(mocks.saveDraft).toHaveBeenCalledWith({ comment: 'Very useful', rating: 5 });
        expect(mocks.navigate).toHaveBeenCalledWith('/login', {
            state: { demoFeedbackReturn: true },
        });
        expect(mocks.submit).not.toHaveBeenCalled();
    });

    it('auto-submits the restored draft when returning from login for feedback', async () => {
        mocks.auth.isAuthenticated = true;
        mocks.auth.user = { email: 'user@example.com', name: 'Test User' };
        mocks.hasReturn.mockReturnValue(true);
        mocks.consumeDraft.mockReturnValue({ comment: 'Draft comment', rating: 4 });
        mocks.fetchRecent
            .mockResolvedValueOnce(emptyResponse)
            .mockResolvedValueOnce({
                summary: { average: 4, count: 1 },
                reviews: [{
                    user_name: 'Test User',
                    comment: 'Draft comment',
                    rating: 4,
                    created_at: '2026-01-01T00:00:00Z',
                }],
            });

        render(<DemoFeedback language="en" />);

        await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({
            comment: 'Draft comment',
            rating: 4,
            language: 'en',
        }));
        expect(mocks.submit).toHaveBeenCalledTimes(1);
        expect(mocks.clearReturn).toHaveBeenCalledOnce();
        expect(mocks.fetchRecent).toHaveBeenCalledTimes(2);
        expect(await screen.findByRole('status')).toHaveTextContent('Thanks! Your review is now live.');
        expect(screen.getByPlaceholderText('What did you like? What would you improve?')).toHaveValue('');
    });

    it('does not auto-submit a leftover draft when the user did not go to login for feedback', async () => {
        mocks.auth.isAuthenticated = true;
        mocks.auth.user = { email: 'user@example.com', name: 'Test User' };
        mocks.hasReturn.mockReturnValue(false);
        mocks.consumeDraft.mockReturnValue({ comment: 'Draft comment', rating: 4 });

        render(<DemoFeedback language="en" />);
        await screen.findByText('No reviews yet!');

        expect(mocks.consumeDraft).not.toHaveBeenCalled();
        expect(mocks.submit).not.toHaveBeenCalled();
    });

    it('clears the return flag without submitting when there is no valid draft', async () => {
        mocks.auth.isAuthenticated = true;
        mocks.auth.user = { email: 'user@example.com', name: 'Test User' };
        mocks.hasReturn.mockReturnValue(true);
        mocks.consumeDraft.mockReturnValue({ comment: '', rating: 0 });

        render(<DemoFeedback language="en" />);
        await screen.findByText('No reviews yet!');

        expect(mocks.clearReturn).toHaveBeenCalledOnce();
        expect(mocks.submit).not.toHaveBeenCalled();
    });

    it('blocks empty submissions and exposes authenticated logout', async () => {
        mocks.auth.isAuthenticated = true;
        mocks.auth.user = { email: 'user@example.com', name: 'Test User' };
        render(<DemoFeedback language="en" />);
        await screen.findByText('No reviews yet!');

        const submit = screen.getByRole('button', { name: 'Leave feedback' });
        expect(submit).toBeDisabled();
        fireEvent.click(submit);
        expect(mocks.submit).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(mocks.auth.logout).toHaveBeenCalledOnce();
    });

    it('distinguishes expired auth from a generic backend failure', async () => {
        mocks.auth.isAuthenticated = true;
        mocks.auth.user = { email: 'user@example.com' };
        mocks.submit.mockRejectedValue(new Error('HTTP 401: invalid token'));
        render(<DemoFeedback language="en" />);
        await screen.findByText('No reviews yet!');

        fireEvent.change(screen.getByPlaceholderText('What did you like? What would you improve?'), {
            target: { value: 'Comment' },
        });
        fireEvent.click(screen.getByRole('radio', { name: '3 stars — Average' }));
        fireEvent.click(screen.getByRole('button', { name: 'Leave feedback' }));

        expect(await screen.findByText('Your session expired. Sign in again to submit.')).toBeVisible();
    });

    it('does not disguise a GET failure as backend data', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.fetchRecent.mockRejectedValue(new Error('offline'));
        render(<DemoFeedback language="es" />);

        await waitFor(() => expect(errorSpy).toHaveBeenCalled());
        expect(screen.getByText('¡Aún no hay opiniones!')).toBeVisible();
        errorSpy.mockRestore();
    });
});
