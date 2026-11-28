import { place } from './src/orders';
import { log } from './src/logger';
vi.mock('./src/orders');
vi.mock('./src/logger', () => ({ log: vi.fn() }));
it('places', () => {
  place();
});
