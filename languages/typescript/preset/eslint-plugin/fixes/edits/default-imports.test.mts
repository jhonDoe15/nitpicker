import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { importingDefault } from './imports.mts';
import { replacing } from '../support/ranges.mts';
import { allOf } from './plans.mts';

const rule: TSESLint.RuleModule<'use'> = {
  meta: { type: 'problem', fixable: 'code', schema: [], messages: { use: 'use' } },
  defaultOptions: [],
  create(context) {
    const { sourceCode } = context;
    return {
      'CallExpression[callee.name="use"]'(call: TSESTree.CallExpression) {
        const edit = importingDefault(sourceCode, sourceCode.ast, {
          sources: ['p-map'],
          name: 'pMap',
          sites: [call],
        });
        const fix =
          edit === undefined
            ? undefined
            : allOf(
                [
                  edit.present ? undefined : edit.plan,
                  replacing(call.range, `${edit.local}()`),
                ].filter((plan) => plan !== undefined),
              );
        context.report({ node: call, messageId: 'use', ...(fix === undefined ? {} : { fix }) });
      },
    };
  },
};

const ERR = [{ messageId: 'use' as const }];

function fixes(code: string, output: string) {
  return { code, output, errors: ERR };
}

function declines(code: string) {
  return { code, output: null, errors: ERR };
}

typescriptRuleTester().run('default import helper', rule, {
  valid: [],
  invalid: [
    fixes('export const a = use();', "import pMap from 'p-map';\nexport const a = pMap();"),
    fixes(
      'import { x } from "y";\nexport const a = use();',
      'import { x } from "y";\nimport pMap from "p-map";\nexport const a = pMap();',
    ),
    fixes(
      "import pMap from 'p-map';\nexport const a = use();",
      "import pMap from 'p-map';\nexport const a = pMap();",
    ),
    fixes(
      "import pm from 'p-map';\nexport const a = use();",
      "import pm from 'p-map';\nexport const a = pm();",
    ),
    fixes(
      "import pm, { x } from 'p-map';\nexport const a = use();",
      "import pm, { x } from 'p-map';\nexport const a = pm();",
    ),
    fixes(
      "import type pm from 'p-map';\nexport const a = use();",
      "import type pm from 'p-map';\nimport pMap from 'p-map';\nexport const a = pMap();",
    ),
    fixes(
      "import { x } from 'p-map';\nexport const a = use();",
      "import { x } from 'p-map';\nimport pMap from 'p-map';\nexport const a = pMap();",
    ),
    fixes(
      "'use strict';\nexport const a = use();",
      "'use strict';\nimport pMap from 'p-map';\nexport const a = pMap();",
    ),
    fixes('export const a = use()', "import pMap from 'p-map'\nexport const a = pMap()"),
    fixes(
      'import { x } from "y"\nexport const a = use()',
      'import { x } from "y"\nimport pMap from "p-map"\nexport const a = pMap()',
    ),
    fixes(
      "'use strict'\nexport const a = use()",
      "'use strict'\nimport pMap from 'p-map'\nexport const a = pMap()",
    ),
    fixes(
      'export class A {}\nexport const a = use()',
      "import pMap from 'p-map'\nexport class A {}\nexport const a = pMap()",
    ),
    fixes(
      'export function f() {}\nexport const a = use();',
      "import pMap from 'p-map';\nexport function f() {}\nexport const a = pMap();",
    ),
    declines('const pMap = 1;\nexport const a = use() + pMap;'),
    declines('export function f() { const pMap = 1; return [pMap, use()]; }'),
    declines("import pMap from 'other';\nexport const a = use() + pMap;"),
    declines("import pm from 'p-map';\nexport function f(pm: number) { return [pm, use()]; }"),
    declines('// header\nexport const a = use();'),
  ],
});
