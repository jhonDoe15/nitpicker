import type { TSESLint } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { sourceOf } from '../request-inputs/bindings/ts-nodes.mts';
import { hasGlobalTrimmer } from './global-trimmer.mts';
import { ancestorsOf, isIdentifierName, reachesLookup } from './lookups.mts';
import {
  type Binding,
  declaredBindings,
  fieldIsTrimmed,
  isRawRequestText,
  isTrimmingAssignment,
} from './request-bindings.mts';

type Use = { readonly node: TypeScript.Node; readonly name: string };
type Finding = { readonly anchor: TypeScript.Node; readonly name: string };

function scopeOf(node: TypeScript.Node): TypeScript.Node {
  const scope = ancestorsOf(node).find(
    (current) => ts.isFunctionLike(current) || ts.isSourceFile(current),
  );
  return scope ?? node.getSourceFile();
}

function walk(root: TypeScript.Node, visit: (node: TypeScript.Node) => void): void {
  const pending = [root];
  for (const node of pending) {
    visit(node);
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
}

function isDeclarationName(identifier: TypeScript.Identifier): boolean {
  const { parent } = identifier;
  return (
    ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) &&
      parent.name === identifier) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
    (ts.isPropertyAssignment(parent) && parent.name === identifier) ||
    (ts.isBindingElement(parent) && parent.propertyName === identifier)
  );
}

function objectFieldTrimmed(
  access: TypeScript.PropertyAccessExpression,
  checker: TypeScript.TypeChecker,
): boolean {
  const symbol = checker.getSymbolAtLocation(access.name);
  const declaration = symbol?.declarations?.[0];
  const type = checker.getNonNullableType(checker.getTypeAtLocation(access));
  const textual = (type.flags & ts.TypeFlags.StringLike) !== 0;
  return !textual || declaration === undefined || fieldIsTrimmed(declaration);
}

function usesOf(
  binding: Binding,
  scope: TypeScript.Node,
  checker: TypeScript.TypeChecker | undefined,
): Use[] {
  const uses: Use[] = [];
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

function isTrimmed(binding: Binding, scope: TypeScript.Node): boolean {
  let trimmed = false;
  walk(scope, (node) => {
    trimmed ||= isTrimmingAssignment(node, binding.name);
  });
  return trimmed;
}

function bindingFindings(
  file: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker | undefined,
): Finding[] {
  const found: Finding[] = [];
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

function directFindings(file: TypeScript.SourceFile): Finding[] {
  const found: Finding[] = [];
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

export const rule: TSESLint.RuleModule<'untrimmed'> = {
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
        const reported = new Set<number>();
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
