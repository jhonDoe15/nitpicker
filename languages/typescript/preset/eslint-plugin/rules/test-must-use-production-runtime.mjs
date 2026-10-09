import path from 'node:path';
import { readLayout } from '../../head-policy.mjs';

const layout = readLayout();
const { testRoots } = layout;

const DEFAULT_EXEMPT_PATTERN = String.raw`/(?:${testRoots.join('|')})/contract/|\.policy\.test\.[cm]?[jt]s$`;
const TEST_SUPPORT = new RegExp(
  `(?:^|/)(?:__tests__|${testRoots.join('|')}|fixtures)(?:/|$)|\\.(?:test|spec)\\.[cm]?[jt]sx?$`,
);

function isRuntimeImport(node) {
  if (node.importKind === 'type') {
    return false;
  }
  if (node.specifiers.length === 0) {
    return true;
  }
  return node.specifiers.some((specifier) => specifier.importKind !== 'type');
}

function isProductionModule(filename, source) {
  const sourceRoot = layout.sourceRoots.find(
    (root) => source.includes(`/${root}/`) || source.startsWith(`${root}/`),
  );
  if (
    sourceRoot !== undefined &&
    layout.isSourceFile(source.slice(source.indexOf(`${sourceRoot}/`)))
  ) {
    return true;
  }
  if (!source.startsWith('.')) {
    return false;
  }

  const resolved = path.resolve(path.dirname(filename), source).replaceAll('\\', '/');
  return layout.sourceRootOf(`${resolved}/`) !== undefined && !TEST_SUPPORT.test(resolved);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require tests to execute a production runtime dependency',
    },
    schema: [
      {
        type: 'object',
        properties: {
          exemptPattern: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingRuntime: 'Import at least one production module at runtime.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const exemptTest = new RegExp(context.options[0]?.exemptPattern ?? DEFAULT_EXEMPT_PATTERN);
    if (exemptTest.test(filename)) {
      return {};
    }

    let program;
    let hasProductionRuntime = false;

    return {
      Program(node) {
        program = node;
      },
      ImportDeclaration(node) {
        if (
          isRuntimeImport(node) &&
          typeof node.source.value === 'string' &&
          isProductionModule(filename, node.source.value)
        ) {
          hasProductionRuntime = true;
        }
      },
      // A dynamic `await import('../foo.js')` — common when a test needs a
      // fresh module instance after vi.mock() — is just as much a production
      // runtime dependency as a static import.
      ImportExpression(node) {
        if (
          node.source.type === 'Literal' &&
          typeof node.source.value === 'string' &&
          isProductionModule(filename, node.source.value)
        ) {
          hasProductionRuntime = true;
        }
      },
      'Program:exit'() {
        if (!hasProductionRuntime) {
          context.report({ node: program, messageId: 'missingRuntime' });
        }
      },
    };
  },
};
