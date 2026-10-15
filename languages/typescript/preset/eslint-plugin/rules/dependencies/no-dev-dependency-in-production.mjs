import path from 'node:path';
import { nearestManifest, packageNameOf } from './package-manifest.mjs';

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

function reportDevelopmentImport({ context, manifest, node, specifier }) {
  const name = specifier === undefined ? undefined : packageNameOf(specifier);
  if (name !== undefined && manifest.development.has(name) && !manifest.runtime.has(name)) {
    context.report({ node, messageId: 'devDependency', data: { name } });
  }
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
        '{{name}} is only a devDependency, but production code imports it. Move it to "dependencies" in package.json, or add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const manifest = nearestManifest(path.dirname(context.filename));
    if (manifest === undefined) {
      return {};
    }
    function checkDeclaration(node) {
      if (!isTypeOnly(node)) {
        reportDevelopmentImport({ context, manifest, node, specifier: literalSource(node.source) });
      }
    }
    return {
      ImportDeclaration: checkDeclaration,
      ExportNamedDeclaration: checkDeclaration,
      ExportAllDeclaration: checkDeclaration,
      ImportExpression(node) {
        reportDevelopmentImport({ context, manifest, node, specifier: literalSource(node.source) });
      },
      CallExpression(node) {
        if (isRequireCall(node)) {
          const specifier = literalSource(node.arguments[0]);
          reportDevelopmentImport({ context, manifest, node, specifier });
        }
      },
    };
  },
};
