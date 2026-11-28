import { describe, it, test, vi, beforeEach } from 'vitest';
test.concurrent('a', async () => { vi.stubEnv('MODE', 'x'); process.chdir('/tmp'); });
test.concurrent('b', async () => { vi.stubGlobal('fetch', run); });
