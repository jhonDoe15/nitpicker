import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import {
  classDeclarationOf,
  decoratedWith,
  decoratorArguments,
  isProjectDeclaration,
} from './nest-classes.mts';

const CATCH = new Set(['Catch']);
const USE_FILTERS = new Set(['UseFilters']);
const REGISTRATIONS = ['APP_FILTER', 'useGlobalFilters'];

function nodesOf(root: TypeScript.Node): TypeScript.Node[] {
  const nodes = [root];
  for (const node of nodes) {
    node.forEachChild((child) => {
      nodes.push(child);
    });
  }
  return nodes;
}

function instanceChecks(
  checker: TypeScript.TypeChecker,
  filter: TypeScript.ClassLikeDeclaration,
): TypeScript.ClassLikeDeclaration[] {
  return nodesOf(filter)
    .flatMap((node) =>
      ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
        ? [classDeclarationOf(checker, node.right)]
        : [],
    )
    .filter((declaration) => declaration !== undefined);
}

export function filterCoverage(
  checker: TypeScript.TypeChecker,
  filter: TypeScript.ClassLikeDeclaration,
): TypeScript.ClassLikeDeclaration[] {
  const [decorator] = decoratedWith(filter, CATCH);
  if (decorator === undefined) {
    return [];
  }
  const caught = decoratorArguments(decorator);
  if (caught.length === 0) {
    return instanceChecks(checker, filter);
  }
  const classes = caught
    .map((argument) => classDeclarationOf(checker, argument))
    .filter((declaration) => declaration !== undefined);
  const catchesAll = caught.some(
    (argument) => ts.isIdentifier(argument) && argument.text === 'Error',
  );
  return catchesAll ? [...classes, ...instanceChecks(checker, filter)] : classes;
}

function propertyName(property: TypeScript.ObjectLiteralElementLike): string | undefined {
  const { name } = property;
  return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined;
}

function propertyNamed(
  object: TypeScript.ObjectLiteralExpression,
  name: string,
): TypeScript.Node | undefined {
  const property = object.properties.find((candidate) => propertyName(candidate) === name);
  if (property !== undefined && ts.isShorthandPropertyAssignment(property)) {
    return property.name;
  }
  return property !== undefined && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined;
}

function providedFilter(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.ClassLikeDeclaration | undefined {
  if (!ts.isObjectLiteralExpression(node)) {
    return undefined;
  }
  const provide = propertyNamed(node, 'provide');
  if (provide === undefined || provide.getText() !== 'APP_FILTER') {
    return undefined;
  }
  return classDeclarationOf(
    checker,
    propertyNamed(node, 'useClass') ?? propertyNamed(node, 'useValue'),
  );
}

function registeredFilters(
  checker: TypeScript.TypeChecker,
  node: TypeScript.Node,
): TypeScript.ClassLikeDeclaration[] {
  const isRegistration =
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'useGlobalFilters';
  if (!isRegistration) {
    const provided = providedFilter(checker, node);
    return provided === undefined ? [] : [provided];
  }
  return node.arguments
    .map((argument) => classDeclarationOf(checker, argument))
    .filter((declaration) => declaration !== undefined);
}

function registeringFiles(program: TypeScript.Program): TypeScript.SourceFile[] {
  return program
    .getSourceFiles()
    .filter(
      (file) =>
        !file.isDeclarationFile &&
        isProjectDeclaration(file) &&
        REGISTRATIONS.some((name) => file.text.includes(name)),
    );
}

export function globalFilters(program: TypeScript.Program): TypeScript.ClassLikeDeclaration[] {
  const checker = program.getTypeChecker();
  return registeringFiles(program).flatMap((file) =>
    nodesOf(file).flatMap((node) => registeredFilters(checker, node)),
  );
}

export function localFilters(
  checker: TypeScript.TypeChecker,
  declarations: readonly TypeScript.Node[],
): TypeScript.ClassLikeDeclaration[] {
  return declarations
    .flatMap((declaration) => decoratedWith(declaration, USE_FILTERS))
    .flatMap((decorator) => decoratorArguments(decorator))
    .map((argument) => classDeclarationOf(checker, argument))
    .filter((declaration) => declaration !== undefined);
}
