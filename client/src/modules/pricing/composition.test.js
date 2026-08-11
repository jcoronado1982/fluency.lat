import { describe, expect, it } from 'vitest';
import { checkoutPort } from './composition';

// Fija el wiring del composition root: el puerto expuesto debe ser el contrato
// congelado (DIP/ISP), no el adapter crudo ni un objeto mutable.
describe('pricing composition root', () => {
    it('exposes a frozen checkoutPort with the expected contract', () => {
        expect(Object.isFrozen(checkoutPort)).toBe(true);
        expect(typeof checkoutPort.createCheckoutSession).toBe('function');
    });
});
