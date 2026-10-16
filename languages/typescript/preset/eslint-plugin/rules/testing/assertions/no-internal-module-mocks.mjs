import path from 'node:path';
import { readLayout } from '../../../../head-policy.mjs';
import { createRunnerApis, moduleMockSource, runnerApiVisitors } from '../runners/runner-apis.mjs';

const layout = readLayout();

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
        const target = moduleMockSource(apis, node);
        const source = target?.type === 'ImportExpression' ? target.source.value : target?.value;
        if (typeof source !== 'string') return;
        const resolved = source.startsWith('.')
          ? path.resolve(path.dirname(context.filename), source).replaceAll('\\\\', '/')
          : source;
        const sourceRoot = layout.sourceRootOf(resolved);
        if (
          sourceRoot === undefined ||
          layout.isTestFile(resolved.slice(resolved.indexOf(`/${sourceRoot}/`) + 1))
        )
          return;
        context.report({ node, messageId: 'internalMock', data: { source } });
      },
    };
  },
};
