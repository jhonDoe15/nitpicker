import { AppProcess } from '../fixtures/app-process.js';
it('exits 2 on bad input', async () => { expect((await AppProcess.run(['--bad'])).code).toBe(2); });