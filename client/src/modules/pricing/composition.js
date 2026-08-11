import { httpClient } from '../../services/httpClient';
import { createCheckoutHttpAdapter } from './adapters/checkoutHttpAdapter';
import { createCheckoutPort } from './ports/checkoutPort';

export const checkoutPort = createCheckoutPort(createCheckoutHttpAdapter(httpClient));
