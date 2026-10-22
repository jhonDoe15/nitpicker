import path from 'node:path';

const TEST_SUPPORT_DIRECTORY = 'test-support';
const HELPER_DIRECTORIES = new Set([
  'testing',
  'test-utils',
  'test-helpers',
  TEST_SUPPORT_DIRECTORY,
  'test-fixtures',
  'fixtures',
  '__fixtures__',
  '__mocks__',
]);
const HELPER_STEM = /^(?:.*[-.])?(?:test-utils|test-helpers|test-support|fixtures)$/u;
const EXCEPTION_ROUTE =
  'If it is real production code, add an exception for nitpicker/no-test-helpers-in-source in nitpicker.config.json.';

function helperName(filename, { colocated }) {
  const parts = filename.replaceAll('\\', '/').split('/');
  const directories = parts.slice(0, -1);
  if (colocated && directories.includes(TEST_SUPPORT_DIRECTORY)) {
    return undefined;
  }
  const directory = directories.find((part) => HELPER_DIRECTORIES.has(part));
  if (directory !== undefined) {
    return `${directory}/`;
  }
  const stem = path.parse(parts.at(-1)).name;
  return HELPER_STEM.test(stem) ? parts.at(-1) : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep test helpers and fixtures out of production source roots' },
    schema: [
      {
        type: 'object',
        properties: { colocated: { type: 'boolean' }, testRoot: { type: 'string' } },
        additionalProperties: false,
      },
    ],
    messages: {
      testHelper: `This looks like a test helper ({{name}}), but it sits in production source, so it is mutation-tested and shipped. Tests in this project live under {{testRoot}}/, so move it to a test-support/ folder there ({{testRoot}}/test-support/). ${EXCEPTION_ROUTE}`,
      colocatedTestHelper: `This looks like a test helper ({{name}}), but it sits in production source outside a test-support/ folder. Tests in this project sit next to the code, and test-only modules go in a test-support/ folder beside the code they serve: move it there. ${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const { colocated = false, testRoot = 'test' } = context.options[0] ?? {};
    const name = helperName(path.relative(context.cwd, context.filename), { colocated });
    return {
      Program(node) {
        if (name === undefined) {
          return;
        }
        context.report({
          node,
          messageId: colocated ? 'colocatedTestHelper' : 'testHelper',
          data: { name, testRoot },
        });
      },
    };
  },
};
