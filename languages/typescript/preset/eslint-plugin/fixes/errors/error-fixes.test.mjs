import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule as preserveErrorCause } from '../../rules/errors/preserve-error-cause.mjs';
import { rule as structuredCatchLogging } from '../../rules/errors/structured-catch-logging.mjs';

const tester = typescriptRuleTester();
const lost = [{ messageId: 'lostCause' }];
const wrap = (statement) => `try { run(); } catch (error) { ${statement} }`;

tester.run('preserve-error-cause fixes', preserveErrorCause, {
  valid: [],
  invalid: [
    {
      code: wrap("throw new Error('failed');"),
      errors: lost,
      output: wrap("throw new Error('failed', { cause: error });"),
    },
    {
      code: wrap("throw new Error('failed', {});"),
      errors: lost,
      output: wrap("throw new Error('failed', { cause: error });"),
    },
    {
      code: wrap("throw new Error('failed', { code: 1 });"),
      errors: lost,
      output: wrap("throw new Error('failed', { code: 1, cause: error });"),
    },
    {
      code: wrap(`throw new Error(\`failed \${error}\`);`),
      errors: lost,
      output: wrap(`throw new Error(\`failed \${error}\`, { cause: error });`),
    },
    {
      options: [{ wrappers: [{ name: 'AppError', optionsIndex: 2 }] }],
      code: wrap("throw new AppError('failed', 'code');"),
      errors: lost,
      output: wrap("throw new AppError('failed', 'code', { cause: error });"),
    },
    {
      code: wrap("throw new Error('failed', { cause: other });"),
      errors: lost,
      output: null,
    },
    {
      code: wrap("throw new Error('failed', ...rest);"),
      errors: lost,
      output: null,
    },
    {
      code: wrap("throw new Error('failed', { ...rest });"),
      errors: lost,
      output: null,
    },
    {
      code: wrap("throw new Error('failed', options);"),
      errors: lost,
      output: null,
    },
    {
      code: "try { run(); } catch { throw new Error('failed'); }",
      errors: [{ messageId: 'bindingLess' }],
      output: null,
    },
    {
      code: wrap("throw new TimeoutError('failed');"),
      errors: lost,
      output: null,
    },
  ],
});

const shape = (statement) => `try { run(); } catch (error) { ${statement} }`;

tester.run('structured-catch-logging fixes', structuredCatchLogging, {
  valid: [],
  invalid: [
    {
      code: shape("logger.error('failed', error);"),
      errors: [{ messageId: 'caughtErrorShape' }],
      output: shape("logger.error({ err: error }, 'failed');"),
    },
    {
      code: shape(`logger.warn(error, \`failed \${id}\`);`),
      errors: [{ messageId: 'caughtErrorShape' }],
      output: shape(`logger.warn({ err: error }, \`failed \${id}\`);`),
    },
    {
      code: shape(`logger.error(\`failed \${error.message}\`);`),
      errors: [{ messageId: 'caughtErrorShape' }],
      output: null,
    },
    {
      code: shape("logger.error('failed', error, extra);"),
      errors: [{ messageId: 'caughtErrorShape' }],
      output: null,
    },
    {
      code: shape("logger.error('failed', /* why */ error);"),
      errors: [{ messageId: 'caughtErrorShape' }],
      output: null,
    },
  ],
});
