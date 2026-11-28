import { describe, it, test, vi, beforeEach } from 'vitest';
describe.concurrent('x', () => {
  it('a', async () => { const service = make(); vi.spyOn(service, 'run'); await service.go(); });
  it('c', { concurrent: false }, async () => { vi.useFakeTimers(); });
  it('d', async () => { vi.useFakeTimers(); });
});
