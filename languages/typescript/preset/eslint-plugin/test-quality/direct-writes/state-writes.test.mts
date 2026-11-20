import { rule } from '../fake-timers-require-restore.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';

const tester = typescriptRuleTester();
const storage = { messageId: 'unrestoredStorageWrite' };
const cookie = { messageId: 'unrestoredCookieWrite' };
const directory = { messageId: 'unrestoredDirectoryChange' };
const global = { messageId: 'unrestoredGlobalWrite' };
const env = { messageId: 'unrestoredEnvWrite' };

tester.run('fake-timers-require-restore storage, cookies and the working directory', rule, {
  valid: [
    "afterEach(() => { localStorage.clear(); }); it('a', () => { localStorage.setItem('k', '1'); });",
    "beforeEach(() => { window.sessionStorage.clear(); }); it('a', () => { sessionStorage.setItem('k', '1'); });",
    "describe('x', () => { beforeEach(() => localStorage.removeItem('k')); it('a', () => { localStorage.setItem('k', '1'); }); });",
    "it('a', () => { try { localStorage.setItem('k', '1'); run(); } finally { localStorage.clear(); } });",
    "it('a', () => { sessionStorage.setItem('k', '1'); signOut(); expect(sessionStorage.length).toBe(0); });",
    "it('a', () => { localStorage.setItem('k', '1'); clear(); expect(localStorage.getItem('k')).toBeNull(); });",
    "it('a', () => { const localStorage = new Map(); localStorage.setItem('k', '1'); });",
    "it('a', () => { const saved = document.cookie; document.cookie = 'a=1'; run(); document.cookie = saved; });",
    "const home = process.cwd(); afterEach(() => { process.chdir(home); }); it('a', () => { process.chdir('/tmp'); });",
    "it('a', () => { const old = process.env.MODE; process.env.MODE = 'x'; run(); process.env.MODE = old; });",
    "it('a', async () => { await page.evaluate(() => { localStorage.setItem('k', '1'); window.flag = true; }); });",
    "it('a', () => { page.addInitScript(() => { document.cookie = 'a=1'; }); });",
    "it('a', () => { cy.visit('/'); localStorage.setItem('k', '1'); document.cookie = 'a=1'; });",
    "jest.mock('./a', () => { Object.defineProperty(navigator, 'clipboard', { value: {} }); return {}; });",
  ],
  invalid: [
    {
      code: "it('a', () => { localStorage.setItem('k', '1'); window.sessionStorage.setItem('k', '1'); });",
      errors: [storage, storage],
    },
    {
      code: "afterEach(() => { sessionStorage.clear(); }); it('a', () => { localStorage.setItem('k', '1'); });",
      errors: [storage],
    },
    { code: "it('a', () => { document.cookie = 'session=1'; });", errors: [cookie] },
    { code: "it('a', () => { process.chdir('/tmp'); });", errors: [directory] },
    {
      code: "it('a', () => { Object.defineProperty(navigator, 'language', { value: 'de' }); });",
      errors: [global],
    },
    {
      code: "it('a', () => { const old = process.env.MODE; process.env.MODE = 'x'; run(); process.env.MODE = 'y'; });",
      errors: [env, env],
    },
    {
      code: "it('a', () => { const old = process.env.MODE; process.env.MODE = 'x'; return () => { process.env.MODE = old; }; });",
      errors: [env],
    },
    {
      code: "it('a', async () => { localStorage.setItem('k', '1'); await page.evaluate(() => 1); });",
      errors: [storage],
    },
  ],
});
