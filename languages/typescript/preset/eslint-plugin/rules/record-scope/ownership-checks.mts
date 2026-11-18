import type TypeScript from 'typescript';
import { calleeName } from '../request-inputs/bindings/request-calls.mts';
import { ts } from '../typed/typescript-views.mts';
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
  let current: TypeScript.Node | undefined = node.parent;
  while (current !== undefined && !ts.isFunctionLike(current)) {
    current = current.parent;
  }
  return current;
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
  let found = false;
  const visit = (node: TypeScript.Node) => {
    const checkCall =
      ts.isCallExpression(node) &&
      node.getEnd() <= site.getStart() &&
      CHECK_CALL.test(calleeName(node) ?? '');
    if (checkCall || (ts.isBinaryExpression(node) && comparesOwner(node))) {
      found = true;
    }
    node.forEachChild(visit);
  };
  visit(fn);
  return found;
}

export function isExemptContext(site: TypeScript.Node, sourceFile: TypeScript.SourceFile): boolean {
  if (EXEMPT_NAME.test(sourceFile.fileName)) {
    return true;
  }
  let current: TypeScript.Node | undefined = site;
  while (current !== undefined) {
    const named =
      (ts.isClassDeclaration(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isFunctionDeclaration(current)) &&
      current.name !== undefined &&
      EXEMPT_NAME.test(current.name.getText(sourceFile));
    const decorators = ts.canHaveDecorators(current) ? (ts.getDecorators(current) ?? []) : [];
    if (named || decorators.some((decorator) => EXEMPT_NAME.test(decorator.getText(sourceFile)))) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
