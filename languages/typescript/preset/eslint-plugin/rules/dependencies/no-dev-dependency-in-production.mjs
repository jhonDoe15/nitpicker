import path from 'node:path';
import { exceptionHint } from '../../../../../../shared/hygiene/rules.mjs';
import { nearestManifest, packageNameOf } from './package-manifest.mjs';
import { isTestSupportFile } from './test-support.mjs';

const RULE_ID = 'nitpicker/no-dev-dependency-in-production';

function isTypeOnly(node) {
  return (
    node.importKind === 'type' ||
    node.exportKind === 'type' ||
    (node.type === 'ImportDeclaration' &&
      node.specifiers.length > 0 &&
      node.specifiers.every((specifier) => specifier.importKind === 'type'))
  );
}

function literalSource(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

function reportDevelopmentImport({ context, manifest, node, specifier, file }) {
  const name = specifier === undefined ? undefined : packageNameOf(specifier);
  if (name !== undefined && manifest.development.has(name) && !manifest.runtime.has(name)) {
    const hint = exceptionHint(RULE_ID, file);
    context.report({ node, messageId: 'devDependency', data: { name, hint } });
  }
}

function projectPath(context, file) {
  return path.relative(context.cwd, file).split(path.sep).join('/');
}

function unreadableManifestVisitor(context, manifest) {
  return {
    Program(node) {
      const data = { manifest: projectPath(context, manifest.file) };
      context.report({ node, messageId: 'unreadableManifest', data });
    },
  };
}

function isRequireCall(node) {
  return node.callee.type === 'Identifier' && node.callee.name === 'require';
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Production code imports only packages listed in dependencies',
    },
    schema: [],
    messages: {
      devDependency:
        '{{name}} is only a devDependency, but production code imports it. Move it to "dependencies" in package.json. {{hint}}',
      unreadableManifest:
        '{{manifest}} is not a JSON object, so imports cannot be checked against its dependencies. Fix the file.',
    },
  },
  create(context) {
    const file = projectPath(context, context.filename);
    const manifest = nearestManifest(path.dirname(context.filename));
    if (manifest === undefined || isTestSupportFile(file)) {
      return {};
    }
    if (manifest.kind === 'unreadable') {
      return unreadableManifestVisitor(context, manifest);
    }
    if (manifest.bundledApp) {
      return {};
    }
    function check(node, specifier) {
      reportDevelopmentImport({ context, manifest, node, specifier, file });
    }
    function checkDeclaration(node) {
      if (!isTypeOnly(node)) {
        check(node, literalSource(node.source));
      }
    }
    return {
      ImportDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ExportAllDeclaration: checkDeclaration,
      ImportExpression(node) {
        check(node, literalSource(node.source));
      },
      CallExpression(node) {
        if (isRequireCall(node)) {
          check(node, literalSource(node.arguments[0]));
        }
      },
    };
  },
};
