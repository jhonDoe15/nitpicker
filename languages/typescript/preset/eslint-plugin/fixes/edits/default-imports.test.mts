import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { importingDefault } from './imports.mts';
import { declines, fixes, useRule } from './test-support/use-rule.mts';

const rule = useRule(({ sourceCode, call }) => {
  const edit = importingDefault(sourceCode, sourceCode.ast, {
    sources: ['p-map'],
    name: 'pMap',
    sites: [call],
  });
  return edit === undefined
    ? undefined
    : { imports: edit.present ? undefined : edit.plan, text: `${edit.local}()` };
});

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
