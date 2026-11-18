import path from 'node:path';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/test-runtime/environment/no-unused-dom-environment.mts';
import {
  createProject,
  docblock,
  lines,
  logic,
} from '../../testing-rules/test-support/environment-project.mts';

const tester = typescriptRuleTester();
const tag = (name: string, tool = 'vitest') => `@${tool}${'-environment'} ${name}`;
const directive = (name: string) => ['// @vitest', `-environment ${name}`].join('');
const root = createProject();
const filename = path.join(root, 'src/widgets/widget.test.ts');
const jsdom = { environment: 'jsdom' };

const support = (name: string) => path.join(root, 'src/support', name);
const widgetTsx = path.join(root, 'src/widgets/widget.test.tsx');
const unused = [{ messageId: 'unusedDirectiveEnvironment' }];

function fixesTo(code: string, output: string, extra: Record<string, unknown> = {}) {
  return { filename, code, options: [{}], errors: unused, output, ...extra };
}

function declines(code: string) {
  return { filename, code, options: [{}], errors: unused, output: null };
}

tester.run('no-unused-dom-environment fixes', rule, {
  valid: [
    { filename, code: lines(docblock('jsdom'), logic, 'requestAnimationFrame(() => undefined);') },
    { filename, code: lines(docblock('jsdom'), logic, "localStorage.setItem('k', 'v');") },
    { filename, code: lines(docblock('happy-dom'), logic, 'sessionStorage.clear();') },
    {
      filename,
      code: lines(docblock('jsdom'), logic),
      options: [{ environment: 'jsdom', setupFiles: [support('dom-helper.ts')] }],
    },
  ],
  invalid: [
    {
      filename,
      code: lines(docblock('jsdom'), logic),
      options: [{ environment: 'node' }],
      errors: [{ messageId: 'unusedDirectiveEnvironment' }],
      output: lines(docblock('node'), logic),
    },
    {
      filename,
      code: lines(docblock('happy-dom'), logic),
      options: [jsdom],
      errors: [{ messageId: 'unusedDirectiveOverDomProject' }],
      output: lines(docblock('node'), logic),
    },
    {
      filename,
      code: lines(docblock('jsdom', 'jest'), logic),
      options: [jsdom],
      errors: [{ messageId: 'unusedDirectiveOverDomProject' }],
      output: lines(docblock('node', 'jest'), logic),
    },
    {
      filename,
      code: lines(directive('jsdom'), logic),
      options: [{}],
      errors: [{ messageId: 'unusedDirectiveEnvironment' }],
      output: lines(directive('node'), logic),
    },
    fixesTo(
      lines('/* Widget tests.', ` * ${tag('jsdom')}`, ' * Keep them fast.', ' */', logic),
      lines('/* Widget tests.', ` * ${tag('node')}`, ' * Keep them fast.', ' */', logic),
    ),
    fixesTo(
      lines(
        '/**',
        ` * ${tag('happy-dom')}`,
        ` * ${tag('{}').replace('environment', 'environment-options')}`,
        ' */',
        logic,
      ),
      lines(
        '/**',
        ` * ${tag('node')}`,
        ` * ${tag('{}').replace('environment', 'environment-options')}`,
        ' */',
        logic,
      ),
    ),
    fixesTo(
      lines(docblock('jsdom'), docblock('jsdom', 'jest'), logic),
      lines(docblock('node'), docblock('jsdom', 'jest'), logic),
    ),
    fixesTo(lines(docblock('jsdom'), logic, ''), lines(docblock('node'), logic, '')),
    fixesTo(
      [docblock('jsdom'), logic, ''].join('\r\n'),
      [docblock('node'), logic, ''].join('\r\n'),
    ),
    fixesTo(lines(`// ${tag('jsdom', 'jest')}`, logic), lines(`// ${tag('node', 'jest')}`, logic)),
    fixesTo(
      lines(`/** ${tag('jsdom')} - no DOM here */`, logic),
      lines(`/** ${tag('node')} - no DOM here */`, logic),
    ),
    fixesTo(lines(docblock('jsdom'), logic), lines(docblock('node'), logic), {
      filename: widgetTsx,
    }),
    fixesTo(
      lines("import { sum } from '../support/pure';", docblock('happy-dom'), logic),
      lines("import { sum } from '../support/pure';", docblock('node'), logic),
    ),
    declines(lines(`const text = \`${tag('jsdom')}\`;`, logic)),
    declines(lines(`const text = '${tag('happy-dom', 'jest')}';`, logic)),
    declines(lines(`const pattern = /${tag('jsdom')}/u;`, logic)),
    {
      filename,
      code: logic,
      options: [jsdom],
      errors: [{ messageId: 'unusedProjectEnvironment' }],
      output: null,
    },
    {
      filename,
      code: lines(['const text = "@vitest', '-environment jsdom";'].join(''), logic),
      options: [{}],
      errors: [{ messageId: 'unusedDirectiveEnvironment' }],
      output: null,
    },
  ],
});
