import type TypeScript from 'typescript';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { isProjectFile } from '../../support/project/program.mts';
import { ts } from '../../../rules/typed/typescript-views.mts';

type Association = { readonly owner: string; readonly name: string };

const indexes = new WeakMap<TypeScript.Program, Association[]>();

function asName(options: TypeScript.Expression | undefined): string | undefined {
  if (options === undefined || !ts.isObjectLiteralExpression(options)) {
    return undefined;
  }
  const property = options.properties.find(
    (each): each is TypeScript.PropertyAssignment =>
      ts.isPropertyAssignment(each) && each.name.getText() === 'as',
  );
  return property !== undefined && ts.isStringLiteral(property.initializer)
    ? property.initializer.text
    : undefined;
}

function callAssociation(node: TypeScript.Node): Association | undefined {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression) ||
    node.expression.name.text !== 'hasMany' ||
    !ts.isIdentifier(node.expression.expression)
  ) {
    return undefined;
  }
  const name = asName(node.arguments[1]);
  return name === undefined ? undefined : { owner: node.expression.expression.text, name };
}

function decoratorAssociation(node: TypeScript.Node): Association | undefined {
  const owner = ts.isPropertyDeclaration(node) ? node.parent : undefined;
  const hasMany =
    ts.isPropertyDeclaration(node) &&
    ts.canHaveDecorators(node) &&
    (ts.getDecorators(node) ?? []).some(
      (decorator) =>
        ts.isCallExpression(decorator.expression) &&
        ts.isIdentifier(decorator.expression.expression) &&
        decorator.expression.expression.text === 'HasMany',
    );
  const name = owner !== undefined && ts.isClassLike(owner) ? owner.name?.text : undefined;
  return hasMany && name !== undefined ? { owner: name, name: node.name.getText() } : undefined;
}

function indexOf(program: TypeScript.Program): Association[] {
  return cachedValue(indexes, program, () => {
    const found: Association[] = [];
    const pending: TypeScript.Node[] = program.getSourceFiles().filter(isProjectFile);
    for (const node of pending) {
      const association = callAssociation(node) ?? decoratorAssociation(node);
      if (association !== undefined) {
        found.push(association);
      }
      ts.forEachChild(node, (child) => {
        pending.push(child);
      });
    }
    return found;
  });
}

export function isHasMany(program: TypeScript.Program, { owner, name }: Association): boolean {
  return indexOf(program).some((each) => each.owner === owner && each.name === name);
}
