import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rule } from './report-module-load-effects.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const tester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } });
const filename = '/repo/src/main/main.js';

tester.run('report-module-load-effects for style and asset imports', rule, {
  valid: [
    "import './index.css';",
    "import './theme.scss';",
    "import './theme.sass';",
    "import './theme.less';",
    "import './theme.styl';",
    "import './theme.pcss';",
    "import '../styles/global.css';",
    "import 'normalize.css';",
    "import './index.css?inline';",
    "import styles from './panel.module.css';",
  ].map((code) => ({ filename, code })),
  invalid: [
    "import './polyfill.js';",
    "import 'reflect-metadata';",
    "import './css';",
    "import './index.css.js';",
    "import './stylesheet';",
    "import './x.cssx';",
  ].map((code) => ({ filename, code, errors: [{ messageId: 'sideEffectImport' }] })),
});

describe('module-load messages name the entry point exception', () => {
  it('names layout.entryPoints on every top-level effect but static blocks', () => {
    const hint =
      " Move the work into a function that the app entry calls. The entry (the module script in Vite's index.html, else src/main.tsx) is detected; for another entry file, list it under `layout.entryPoints` in nitpicker.config.json.";
    expect(rule.meta.messages).toEqual({
      sideEffectImport: `Side-effect-only import executes code during module loading.${hint}`,
      staticBlock: 'Static initialization block executes during module loading.',
      topLevelAwait: `Top-level await delays and executes work during module loading.${hint}`,
      topLevelControl: `Top-level {{kind}} executes control flow during module loading.${hint}`,
      topLevelExpression: `Top-level expression executes work during module loading.${hint}`,
      importTimeEffect:
        '`{{call}}` runs when the module is imported. Move it into a function and call that from the composition root, passing the result in. If it must run at import, add an exception for this rule in nitpicker.config.json.',
    });
  });
});

const script = '/repo/scripts/report.mjs';

tester.run('report-module-load-effects for main guards', rule, {
  valid: [
    'if (import.meta.main) { await main(process.argv.slice(2)); }',
    'if (import.meta.url === pathToFileURL(process.argv[1]).href) { await run(); }',
    [
      'if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)',
      '{ for (const name of names) { await check(name); } }',
    ].join(' '),
    'if (require.main === module) { run(); }',
  ].map((code) => ({ filename: script, code })),
  invalid: [
    {
      code: 'if (import.meta.env.DEV) { await connect(); }',
      errors: [{ messageId: 'topLevelControl' }, { messageId: 'topLevelAwait' }],
    },
    {
      code: 'if (import.meta.main) { await run(); } else { await other(); }',
      errors: [
        { messageId: 'topLevelControl' },
        { messageId: 'topLevelAwait' },
        { messageId: 'topLevelAwait' },
      ],
    },
    {
      code: 'if (import.meta.main) { run(); }\nsetup();',
      errors: [{ messageId: 'topLevelExpression' }],
    },
  ].map((entry) => ({ filename: script, ...entry })),
});
