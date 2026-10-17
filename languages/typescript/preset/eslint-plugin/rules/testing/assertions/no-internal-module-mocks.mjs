import path from 'node:path';
import { readLayout } from '../../../../head-policy.mjs';
import { moduleMocks } from '../runners/module-mocks.mjs';
import { createRunnerApis, runnerApiVisitors } from '../runners/runner-apis.mjs';

const layout = readLayout();

function isInternalModule(filename, source) {
  if (typeof source !== 'string') {
    return false;
  }
  const resolved = source.startsWith('.')
    ? path.resolve(path.dirname(filename), source).replaceAll('\\\\', '/')
    : source;
  const sourceRoot = layout.sourceRootOf(resolved);
  return (
    sourceRoot !== undefined &&
    !layout.isTestFile(resolved.slice(resolved.indexOf(`/${sourceRoot}/`) + 1))
  );
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      internalMock:
        'Inject the dependency instead of replacing internal production module {{source}}.',
    },
  },
  create(context) {
    const apis = createRunnerApis();
    return {
      ...runnerApiVisitors(apis),
      CallExpression(node) {
        for (const { name } of moduleMocks(apis, node)) {
          if (isInternalModule(context.filename, name)) {
            context.report({ node, messageId: 'internalMock', data: { source: name } });
          }
        }
      },
    };
  },
};
