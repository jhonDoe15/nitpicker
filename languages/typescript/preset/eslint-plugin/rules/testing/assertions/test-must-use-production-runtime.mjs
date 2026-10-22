import path from 'node:path';
import { readLayout } from '../../../../head-policy.mjs';
import {
  reachableModules,
  resolveModuleSpecifier,
} from '../../../../modules/module-resolution.mjs';
import { moduleReferencesOf, statementSources } from '../../../../modules/module-sources.mjs';
import { isBrowserEndToEndTest } from '../../analysis/test-code-analysis.mjs';
import { RUNNER_OPTION_PROPERTY, vocabularyOf } from '../../runner-apis/runner-option.mjs';

const layout = readLayout();
const { testRoots } = layout;

const DEFAULT_EXEMPT_PATTERN = String.raw`/(?:${testRoots.join('|')})/contract/|\.policy\.test\.[cm]?[jt]s$`;
const TEST_SUPPORT = new RegExp(
  `(?:^|/)(?:__tests__|fixtures)(?:/|$)|^(?:${testRoots.join('|')})(?:/|$)|\\.(?:test|spec)\\.[cm]?[jt]sx?$`,
);

const relativeModule = /^\.{1,2}\//u;
const MAX_REEXPORT_DEPTH = 3;
const MAX_REEXPORTED_FILES = 50;

function resolveModule(fromFile, source) {
  const resolved = resolveModuleSpecifier(source, fromFile);
  return resolved.kind === 'file' ? resolved.path : undefined;
}

function reexportSources(file) {
  return moduleReferencesOf(file)
    .filter(({ reexport }) => reexport)
    .map(({ source }) => source);
}

function helperFiles(helper) {
  const reexported = [
    ...reachableModules(helper, reexportSources, {
      maxDepth: MAX_REEXPORT_DEPTH,
      maxFiles: MAX_REEXPORTED_FILES,
    }),
  ];
  return [helper, ...reexported.map(({ file }) => file).filter(Boolean)];
}

function helperReaches(testFile, source) {
  const helper = resolveModule(testFile, source);
  return (
    helper !== undefined &&
    helperFiles(helper).some((file) =>
      moduleReferencesOf(file).some(
        (reference) => reference.runtime && isProductionModule(file, reference.source),
      ),
    )
  );
}

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
  const resolved = (
    relativeModule.test(source)
      ? path.resolve(path.dirname(filename), source)
      : (resolveModule(filename, source) ?? '')
  ).replaceAll('\\', '/');
  const resolvedRoot = layout.sourceRootOf(`${resolved}/`);
  if (resolvedRoot === undefined) {
    return false;
  }
  const rootRelative = resolved.slice(resolved.indexOf(`/${resolvedRoot}/`) + 1);
  return !TEST_SUPPORT.test(rootRelative) && !layout.isTestFile(rootRelative);
}

function reachesProduction(filename, source) {
  if (isProductionModule(filename, source)) {
    return true;
  }
  return helperReaches(filename, source);
}

function isProductionRequire(filename, node) {
  const [argument] = node.arguments;
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    argument?.type === 'Literal' &&
    typeof argument.value === 'string' &&
    reachesProduction(filename, argument.value)
  );
}

function isExemptTest(context, filename) {
  const exemptTest = new RegExp(context.options[0]?.exemptPattern ?? DEFAULT_EXEMPT_PATTERN);
  const projectFile = path.relative(context.cwd, filename).replaceAll('\\', '/');
  return (
    !(layout.isRunnerTestFile(projectFile) || layout.isRunnerTestFile(filename)) ||
    exemptTest.test(filename) ||
    isBrowserEndToEndTest({
      sources: context.sourceCode.ast.body.flatMap(statementSources),
      projectFile,
      layout,
    })
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
          ...RUNNER_OPTION_PROPERTY,
          exemptPattern: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingRuntime:
        'This test imports no production code at runtime (only types, libraries, or helpers that import none). Import the code under test from the source root, directly or through a helper such as a render function that imports it. Shared helpers belong in {{helperFile}}.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    if (isExemptTest(context, filename)) {
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
          reachesProduction(filename, node.source.value)
        ) {
          hasProductionRuntime = true;
        }
      },
      ImportExpression(node) {
        if (
          node.source.type === 'Literal' &&
          typeof node.source.value === 'string' &&
          reachesProduction(filename, node.source.value)
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
          context.report({
            node: program,
            messageId: 'missingRuntime',
            data: { helperFile: vocabularyOf(context).helperFile },
          });
        }
      },
    };
  },
};
