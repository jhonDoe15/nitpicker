import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rule } from './rules/report-module-load-effects.mjs';

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
  it.each(['sideEffectImport', 'topLevelAwait', 'topLevelControl', 'topLevelExpression'])(
    '%s names layout.entryPoints',
    (messageId) => {
      expect(rule.meta.messages[messageId]).toContain(
        '`layout.entryPoints` in nitpicker.config.json',
      );
    },
  );

  it('keeps the static block message free of the entry point hint', () => {
    expect(rule.meta.messages.staticBlock).not.toContain('entryPoints');
  });
});
