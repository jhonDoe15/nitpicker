import type TypeScript from 'typescript';
import { calleeName } from '../request-inputs/bindings/request-calls.mts';
import { descendantsOf, ts } from '../typed/typescript-views.mts';
import { isOwnerField } from './query-sites.mts';

const CHECK_CALL = new RegExp(
  'access|permission|ownership|owns|belongsto|isowner|canuser|authoriz|assertcan|checkcan|' +
    'ensurecan|isallowed|hasrole',
  'iu',
);
const EXEMPT_NAME = /admin|internal|system|cron|worker|migration|webhook-handler/iu;
const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

export function enclosingFunction(
  node: TypeScript.Node,
): TypeScript.SignatureDeclaration | undefined {
  const pending = [node.parent];
  for (const current of pending) {
    if (ts.isFunctionLike(current)) {
      return current;
    }
    if (!ts.isSourceFile(current)) {
      pending.push(current.parent);
    }
  }
  return undefined;
}

function comparesOwner(node: TypeScript.BinaryExpression): boolean {
  if (!COMPARISONS.has(node.operatorToken.kind)) {
    return false;
  }
  return [node.left, node.right].some((side) => {
    const name = ts.isPropertyAccessExpression(side) ? side.name.text : undefined;
    return name !== undefined && isOwnerField(name);
  });
}

export function hasOwnershipCheck(fn: TypeScript.Node, site: TypeScript.Node): boolean {
  const siteStart = site.getStart();
  return descendantsOf(fn).some(
    (node) =>
      (ts.isCallExpression(node) &&
        node.getEnd() <= siteStart &&
        CHECK_CALL.test(calleeName(node) ?? '')) ||
      (ts.isBinaryExpression(node) && comparesOwner(node)),
  );
}

function isExemptNode(node: TypeScript.Node, sourceFile: TypeScript.SourceFile): boolean {
  const named =
    (ts.isClassDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionDeclaration(node)) &&
    node.name !== undefined &&
    EXEMPT_NAME.test(node.name.getText(sourceFile));
  const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  return named || decorators.some((decorator) => EXEMPT_NAME.test(decorator.getText(sourceFile)));
}

export function isExemptContext(site: TypeScript.Node, sourceFile: TypeScript.SourceFile): boolean {
  if (EXEMPT_NAME.test(sourceFile.fileName)) {
    return true;
  }
  const chain = [site];
  for (const current of chain) {
    if (isExemptNode(current, sourceFile)) {
      return true;
    }
    if (!ts.isSourceFile(current)) {
      chain.push(current.parent);
    }
  }
  return false;
}
