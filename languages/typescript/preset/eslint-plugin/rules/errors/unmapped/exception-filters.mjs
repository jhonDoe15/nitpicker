import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import {
  classDeclarationOf,
  decoratedWith,
  decoratorArguments,
  isProjectDeclaration,
} from './nest-classes.mjs';

const CATCH = new Set(['Catch']);
const USE_FILTERS = new Set(['UseFilters']);
const REGISTRATIONS = ['APP_FILTER', 'useGlobalFilters'];

function nodesOf(root) {
  const nodes = [root];
  for (const node of nodes) {
    node.forEachChild((child) => {
      nodes.push(child);
    });
  }
  return nodes;
}

function instanceChecks(checker, filter) {
  return nodesOf(filter)
    .filter(
      (node) =>
        ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword,
    )
    .map((node) => classDeclarationOf(checker, node.right))
    .filter((declaration) => declaration !== undefined);
}

export function filterCoverage(checker, filter) {
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

function propertyName(property) {
  const { name } = property;
  return name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))
    ? name.text
    : undefined;
}

function propertyNamed(object, name) {
  const property = object.properties.find((candidate) => propertyName(candidate) === name);
  if (property !== undefined && ts.isShorthandPropertyAssignment(property)) {
    return property.name;
  }
  return property !== undefined && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined;
}

function providedFilter(checker, node) {
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

function registeredFilters(checker, node) {
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

function registeringFiles(program) {
  return program
    .getSourceFiles()
    .filter(
      (file) =>
        !file.isDeclarationFile &&
        isProjectDeclaration(file) &&
        REGISTRATIONS.some((name) => file.text.includes(name)),
    );
}

export function globalFilters(program) {
  const checker = program.getTypeChecker();
  return registeringFiles(program).flatMap((file) =>
    nodesOf(file).flatMap((node) => registeredFilters(checker, node)),
  );
}

export function localFilters(checker, declarations) {
  return declarations
    .flatMap((declaration) => decoratedWith(declaration, USE_FILTERS))
    .flatMap((decorator) => decoratorArguments(decorator))
    .map((argument) => classDeclarationOf(checker, argument))
    .filter((declaration) => declaration !== undefined);
}
