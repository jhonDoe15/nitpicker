import { describe, it, test, vi, beforeEach } from 'vitest';
it.concurrent.each([1, 2])('a %s', async () => { vi.useFakeTimers(); });
