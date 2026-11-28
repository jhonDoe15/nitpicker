import type { OrderPort } from './store';
export const fakeOrders: OrderPort = { find: async (id) => ({ id }) };
