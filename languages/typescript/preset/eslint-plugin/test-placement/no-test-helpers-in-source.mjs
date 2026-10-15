import path from 'node:path';

const HELPER_DIRECTORIES = new Set([
  'testing',
  'test-utils',
  'test-helpers',
  'test-support',
  'test-fixtures',
  'fixtures',
  '__fixtures__',
  '__mocks__',
]);
const HELPER_STEM = /^(?:.*[-.])?(?:test-utils|test-helpers|test-support|fixtures)$/u;

function helperName(filename) {
  const parts = filename.replaceAll('\\', '/').split('/');
  const directory = parts.slice(0, -1).find((part) => HELPER_DIRECTORIES.has(part));
  if (directory !== undefined) return `${directory}/`;
  const stem = path.parse(parts.at(-1)).name;
  return HELPER_STEM.test(stem) ? parts.at(-1) : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep test helpers and fixtures out of production source roots' },
    schema: [],
    messages: {
      testHelper:
        'This looks like a test helper ({{name}}), but it sits in production source, so it is mutation-tested and shipped. Move it to the test folder (for example test/support/). If it is real production code, add an exception for nitpicker/no-test-helpers-in-source in nitpicker.config.json.',
    },
  },
  create(context) {
    const name = helperName(path.relative(context.cwd, context.filename));
    return {
      Program(node) {
        if (name !== undefined) context.report({ node, messageId: 'testHelper', data: { name } });
      },
    };
  },
};
