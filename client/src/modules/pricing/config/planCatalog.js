export function getPricingPlanCards() {
    return {
        monthly: {
            premiumPrice: '4.99',
            premiumPeriod: 'month',
        },
        annual: {
            premiumPrice: '49.99',
            monthlyEquivalent: '4.17',
            premiumPeriod: 'month',
        },
    };
}

export function getCheckoutPlanData(t) {
    return {
        monthly: {
            price: 4.99,
            priceDisplay: '$4.99 USD',
            period: 'month',
            label: t.monthlyLabel,
            savingsBadge: null,
            billedAs: '$4.99 USD / month',
        },
        annual: {
            price: 49.99,
            priceDisplay: '$49.99 USD',
            period: 'year',
            label: t.annualLabel,
            savingsBadge: '17%',
            billedAs: '$49.99 USD / year',
        },
    };
}

export function getPremiumPerks(t) {
    return [
        { iconKey: 'book', text: t.perks.words },
        { iconKey: 'globe', text: t.perks.languages },
        { iconKey: 'image', text: t.perks.images },
        { iconKey: 'image', text: t.perks.imageAi },
        { iconKey: 'audio', text: t.perks.audio },
        { iconKey: 'star', text: t.perks.support },
    ];
}
