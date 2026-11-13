import path from 'node:path';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from '../../rules/testing/environment/no-unused-dom-environment.mjs';
import {
  createProject,
  docblock,
  lines,
  logic,
} from '../../testing-rules/test-support/environment-project.mjs';

const tester = typescriptRuleTester();
const directive = (name) => ['// @vitest', `-environment ${name}`].join('');
const root = createProject();
const filename = path.join(root, 'src/widgets/widget.test.ts');
const jsdom = { environment: 'jsdom' };

tester.run('no-unused-dom-environment fixes', rule, {
  valid: [],
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
