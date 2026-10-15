import path from 'node:path';
import { readLayout } from '../../../../head-policy.mjs';

const layout = readLayout();
const { testRoots } = layout;

const DEFAULT_EXEMPT_PATTERN = String.raw`/(?:${testRoots.join('|')})/contract/|\.policy\.test\.[cm]?[jt]s$`;
const RUNNABLE_TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TEST_SUPPORT = new RegExp(
  `(?:^|/)(?:__tests__|fixtures)(?:/|$)|^(?:${testRoots.join('|')})(?:/|$)|\\.(?:test|spec)\\.[cm]?[jt]sx?$`,
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
  const resolvedRoot = layout.sourceRootOf(`${resolved}/`);
  return (
    resolvedRoot !== undefined &&
    !TEST_SUPPORT.test(resolved.slice(resolved.indexOf(`/${resolvedRoot}/`) + 1))
  );
}

function isProductionRequire(filename, node) {
  const [argument] = node.arguments;
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    argument?.type === 'Literal' &&
    typeof argument.value === 'string' &&
    isProductionModule(filename, argument.value)
  );
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
      missingRuntime:
        'This test imports no production code at runtime (only types, helpers or libraries). Import the code under test from the source root. Shared helpers belong in a file not named *.test.* or *.spec.*.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const exemptTest = new RegExp(context.options[0]?.exemptPattern ?? DEFAULT_EXEMPT_PATTERN);
    const projectFile = path.relative(context.cwd, filename).replaceAll('\\', '/');
    if (
      !RUNNABLE_TEST.test(filename) ||
      exemptTest.test(filename) ||
      layout.isEndToEndTest(projectFile)
    ) {
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
      ImportExpression(node) {
        if (
          node.source.type === 'Literal' &&
          typeof node.source.value === 'string' &&
          isProductionModule(filename, node.source.value)
        ) {
          hasProductionRuntime = true;
        }
      },
      CallExpression(node) {
        if (isProductionRequire(filename, node)) {
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
