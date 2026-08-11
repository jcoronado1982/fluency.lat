const ONBOARDING_DISABLED_TEMPORARILY = false;

export function resolveOnboardingCompleted(user, serverCompleted) {
    if (!user?.email) return false;
    if (typeof serverCompleted === 'boolean') return serverCompleted;
    return user.onboarding_completed === true;
}

export function shouldShowOnboarding(user) {
    if (ONBOARDING_DISABLED_TEMPORARILY) return false;
    if (!user?.email) return false;
    return !resolveOnboardingCompleted(user, user.onboarding_completed);
}
