import type TypeScript from 'typescript';
import type { TSESTree } from '@typescript-eslint/utils';
import { ts } from '../../typed/typescript-views.mts';
import { typeServices, type Context } from '../../security/security-values.mts';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

const HOOK_NAME =
  /^(?:Before|After)(?:Insert|Update|Remove|SoftRemove|Recover|Create|Delete|Destroy|Save|Upsert|Bulk\w*)$/u;
const VERSION_NAMES = new Set(['VersionColumn', 'Version', 'VersionAttribute']);
const SUBSCRIBERS = new Set(['EventSubscriber', 'EntitySubscriberInterface']);
const HOOK_METHODS = /^(?:addHook|before\w+|after\w+)$/u;
const SUBSCRIBED = new Set(['listenTo', 'getSubscribedEntities']);
const HINT =
  /EventSubscriber|EntitySubscriberInterface|addHook|\.(?:before|after)[A-Z]|hooks\s*:|version\s*:/u;
type Index = { readonly names: Set<string>; global: boolean };
export type HookStatus = 'unknown' | 'plain' | 'hooked' | 'clean';

const indexes = new WeakMap<TypeScript.Program, Index>();
const MAX_BASES = 3;

function decoratorName(decorator: TypeScript.Decorator): string | undefined {
  const { expression } = decorator;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

const CASCADE_OPTIONS = new Set(['cascade', 'orphanRemoval', 'orphanedRowAction']);

function isOptionHooked(property: TypeScript.ObjectLiteralElementLike): boolean {
  if (!ts.isPropertyAssignment(property)) {
    return false;
  }
  const name = property.name.getText();
  const value = property.initializer.kind;
  return (
    (name === 'version' && value === ts.SyntaxKind.TrueKeyword) ||
    (CASCADE_OPTIONS.has(name) && value !== ts.SyntaxKind.FalseKeyword)
  );
}

function declaresVersion(decorator: TypeScript.Decorator): boolean {
  const { expression } = decorator;
  const options = ts.isCallExpression(expression) ? expression.arguments : [];
  return options.some(
    (argument) =>
      ts.isObjectLiteralExpression(argument) && argument.properties.some(isOptionHooked),
  );
}

function isHookDecorator(decorator: TypeScript.Decorator): boolean {
  const name = decoratorName(decorator);
  return (
    name !== undefined &&
    (HOOK_NAME.test(name) || VERSION_NAMES.has(name) || declaresVersion(decorator))
  );
}

function memberHooked(member: TypeScript.ClassElement): boolean {
  const decorators = ts.canHaveDecorators(member) ? (ts.getDecorators(member) ?? []) : [];
  return decorators.some(isHookDecorator);
}

function returnedNames(method: TypeScript.MethodDeclaration): string[] {
  const names: string[] = [];
  function visit(node: TypeScript.Node): void {
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      const value = node.expression;
      const items = ts.isArrayLiteralExpression(value) ? [...value.elements] : [value];
      appendAll(
        names,
        items.filter(ts.isIdentifier).map((item) => item.text),
      );
    }
    if (!ts.isFunctionLike(node) || node === method) {
      ts.forEachChild(node, visit);
    }
  }
  visit(method);
  return names;
}

function isSubscriber(node: TypeScript.ClassDeclaration): boolean {
  const decorated = (ts.getDecorators(node) ?? []).some((each) =>
    SUBSCRIBERS.has(decoratorName(each) ?? ''),
  );
  const implemented = (node.heritageClauses ?? []).some((clause) =>
    clause.types.some((type) => SUBSCRIBERS.has(type.expression.getText())),
  );
  return decorated || implemented;
}

function noteSubscriber(node: TypeScript.ClassDeclaration, index: Index): void {
  const lookup = node.members
    .filter(ts.isMethodDeclaration)
    .find((member) => SUBSCRIBED.has(member.name.getText()));
  const names = lookup === undefined ? [] : returnedNames(lookup);
  if (names.length === 0) {
    index.global = true;
  }
  for (const name of names) {
    index.names.add(name);
  }
}

function noteCall(node: TypeScript.CallExpression, index: Index): void {
  const callee = node.expression;
  if (!(ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression))) {
    return;
  }
  const isHookCall = HOOK_METHODS.test(callee.name.text);
  const configured =
    callee.name.text === 'init' &&
    node.arguments.some(
      (argument) =>
        ts.isObjectLiteralExpression(argument) && /hooks|version/u.test(argument.getText()),
    );
  if (isHookCall || configured) {
    index.names.add(callee.expression.text);
  }
}

function scan(sourceFile: TypeScript.SourceFile, index: Index): void {
  function visit(node: TypeScript.Node): void {
    if (ts.isClassDeclaration(node) && isSubscriber(node)) {
      noteSubscriber(node, index);
    }
    if (ts.isCallExpression(node)) {
      noteCall(node, index);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function programIndex(program: TypeScript.Program): Index {
  return cachedValue(indexes, program, () => {
    const index: Index = { names: new Set<string>(), global: false };
    for (const file of program.getSourceFiles()) {
      if (
        !file.isDeclarationFile &&
        !file.fileName.includes('/node_modules/') &&
        HINT.test(file.text)
      ) {
        scan(file, index);
      }
    }
    return index;
  });
}

function baseDeclaration(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.ClassDeclaration,
): TypeScript.ClassDeclaration | undefined {
  const clause = declaration.heritageClauses?.find(
    (each) => each.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const base = clause?.types[0];
  const symbol = base === undefined ? undefined : checker.getTypeAtLocation(base).getSymbol();
  return symbol?.declarations?.find(ts.isClassDeclaration);
}

function classHooked(
  checker: TypeScript.TypeChecker,
  declaration: TypeScript.ClassDeclaration,
): boolean {
  const chain = [declaration];
  for (const current of chain.slice(0, MAX_BASES)) {
    const base = baseDeclaration(checker, current);
    if (base !== undefined) {
      chain.push(base);
    }
  }
  return chain.some((current) => current.members.some(memberHooked));
}

const LOOSE_TYPES = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function rowClass(
  services: NonNullable<ReturnType<typeof typeServices>>,
  awaited: TSESTree.Node,
): {
  readonly checker: TypeScript.TypeChecker;
  readonly declaration: TypeScript.ClassDeclaration | undefined;
  readonly loose: boolean;
} {
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(awaited);
  const element = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  const loose = element === undefined || (element.flags & LOOSE_TYPES) !== 0;
  const declaration = loose
    ? undefined
    : element.getSymbol()?.declarations?.find(ts.isClassDeclaration);
  return { checker, declaration, loose };
}

export function hookStatus(context: Context, awaited: TSESTree.Node): HookStatus {
  const services = typeServices(context);
  if (services === undefined) {
    return 'unknown';
  }
  const { checker, declaration, loose } = rowClass(services, awaited);
  if (loose) {
    return 'unknown';
  }
  if (declaration === undefined) {
    return 'plain';
  }
  const index = programIndex(services.program);
  const hooked =
    index.global ||
    (declaration.name !== undefined && index.names.has(declaration.name.text)) ||
    classHooked(checker, declaration);
  return hooked ? 'hooked' : 'clean';
}
