import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { sourceOf } from '../request-inputs/bindings/ts-nodes.mjs';
import { hasGlobalTrimmer } from './global-trimmer.mjs';
import { ancestorsOf, isIdentifierName, reachesLookup } from './lookups.mjs';
import {
  declaredBindings,
  fieldIsTrimmed,
  isRawRequestText,
  isTrimmingAssignment,
} from './request-bindings.mjs';

function scopeOf(node) {
  const scope = ancestorsOf(node).find(
    (current) => ts.isFunctionLike(current) || ts.isSourceFile(current),
  );
  return scope ?? node.getSourceFile();
}

function walk(root, visit) {
  const pending = [root];
  for (const node of pending) {
    visit(node);
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
}

function isDeclarationName(identifier) {
  const { parent } = identifier;
  return (
    ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) &&
      parent.name === identifier) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
    (ts.isPropertyAssignment(parent) && parent.name === identifier) ||
    (ts.isBindingElement(parent) && parent.propertyName === identifier)
  );
}

function objectFieldTrimmed(access, checker) {
  const symbol = checker.getSymbolAtLocation(access.name);
  const declaration = symbol?.declarations?.[0];
  const type = checker.getNonNullableType(checker.getTypeAtLocation(access));
  const textual = (type.flags & ts.TypeFlags.StringLike) !== 0;
  return !textual || declaration === undefined || fieldIsTrimmed(declaration);
}

function usesOf(binding, scope, checker) {
  const uses = [];
  walk(scope, (node) => {
    const isValue =
      binding.kind === 'value' &&
      ts.isIdentifier(node) &&
      node.text === binding.name &&
      !isDeclarationName(node);
    if (isValue) {
      uses.push({ node, name: binding.field });
    }
    const isField =
      binding.kind === 'object' &&
      checker !== undefined &&
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === binding.name &&
      !objectFieldTrimmed(node, checker);
    if (isField) {
      uses.push({ node, name: node.name.text });
    }
  });
  return uses.filter(({ node, name }) => !isIdentifierName(name) && reachesLookup(node));
}

function isTrimmed(binding, scope) {
  let trimmed = false;
  walk(scope, (node) => {
    trimmed ||= isTrimmingAssignment(node, binding.name);
  });
  return trimmed;
}

function bindingFindings(file, checker) {
  const found = [];
  walk(file, (node) => {
    for (const binding of declaredBindings(node)) {
      const scope = ts.isParameter(node) ? node.parent : scopeOf(node);
      const [use] = isTrimmed(binding, scope) ? [] : usesOf(binding, scope, checker);
      if (use !== undefined) {
        found.push({ anchor: binding.anchor, name: use.name });
      }
    }
  });
  return found;
}

function directFindings(file) {
  const found = [];
  walk(file, (node) => {
    const access =
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isCallExpression(node);
    const direct = access && isRawRequestText(node) && reachesLookup(node);
    if (direct && !ts.isVariableDeclaration(node.parent)) {
      found.push({ anchor: node, name: node.getText() });
    }
  });
  return found;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: [
        'Disallow request text that reaches a search, filter or lookup without being trimmed,',
        'unless the application trims request text in one place',
      ].join(' '),
    },
    schema: [],
    messages: {
      untrimmed: [
        '{{name}} comes from the request untrimmed and reaches a lookup, so a padded value finds nothing.',
        'Call .trim() on it, or trim in one place: a global pipe, interceptor or middleware,',
        'a zod schema that trims (z.string().trim()), or a @Transform that trims the DTO field.',
      ].join(' '),
    },
  },
  create(context) {
    return {
      'Program:exit'() {
        if (hasGlobalTrimmer(context.filename)) {
          return;
        }
        const { file, checker } = sourceOf(context);
        const reported = new Set();
        for (const { anchor, name } of [
          ...bindingFindings(file, checker),
          ...directFindings(file),
        ]) {
          if (!reported.has(anchor.pos)) {
            reported.add(anchor.pos);
            const { sourceCode } = context;
            context.report({
              loc: {
                start: sourceCode.getLocFromIndex(anchor.getStart(file)),
                end: sourceCode.getLocFromIndex(anchor.getEnd()),
              },
              messageId: 'untrimmed',
              data: { name },
            });
          }
        }
      },
    };
  },
};
