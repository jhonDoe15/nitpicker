import type TypeScript from 'typescript';
import { chainOf } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { type CallView, tsCallee, tsCallView, type TsCall } from './call-views.mts';
import { directEffects, namedKind, type Effects } from './call-tags.mts';
import { isTerminalMethod, isTsConsumed } from '../flow/consumed.mts';
import {
  calleeDeclaration,
  functionLike,
  implementationsOf,
  type ImplementationState,
  type TsFunction,
} from './implementations.mts';
import { libraryKind, packageFromPath, type AsyncCheck } from './packages.mts';

type TsView = CallView<TypeScript.Identifier>;
type Site = { readonly call: TsCall; readonly view: TsView };
export type Resolved =
  | {
      readonly view: TsView;
      readonly effects: Effects;
      readonly guessed?: true;
      readonly targets?: undefined;
    }
  | {
      readonly view: TsView;
      readonly targets: TsFunction[];
      readonly effects?: undefined;
      readonly guessed?: undefined;
    };
export type CalleeOrigin = {
  readonly pkg: string | undefined;
  readonly owner: string | undefined;
};

function unwrapped(node: TypeScript.Node): TypeScript.Node {
  return (
    chainOf<TypeScript.Node>(node, (current) =>
      ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)
        ? current.expression
        : undefined,
    ).at(-1) ?? node
  );
}

function calleeParts(call: TsCall): {
  readonly callee: TypeScript.Node;
  readonly name: TypeScript.Node;
  readonly receiver: TypeScript.Node | undefined;
} {
  const callee = unwrapped(tsCallee(call));
  const member = ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee);
  const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
  return { callee, name, receiver: member ? callee.expression : undefined };
}

function isAmbientModule(
  node: TypeScript.Node,
): node is TypeScript.ModuleDeclaration & { readonly name: TypeScript.StringLiteral } {
  return ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name);
}

function ambientModule(declaration: TypeScript.Node): string | undefined {
  const module = chainOf<TypeScript.Node>(declaration, (node) => node.parent).find(isAmbientModule);
  return module?.name.text;
}

function declarationPackage(
  { program }: ImplementationState,
  declaration: TypeScript.Node,
): string | undefined {
  const file = declaration.getSourceFile();
  if (program.isSourceFileDefaultLibrary(file)) {
    return 'lib';
  }
  return ambientModule(declaration) ?? packageFromPath(file.fileName);
}

function typeDeclaration(
  { checker }: ImplementationState,
  node: TypeScript.Node,
): TypeScript.Declaration | undefined {
  const type = checker.getNonNullableType(checker.getTypeAtLocation(node));
  return (type.aliasSymbol ?? type.getSymbol())?.declarations?.[0];
}

function hasCallableThen(
  checker: TypeScript.TypeChecker,
  type: TypeScript.Type,
  call: TypeScript.Node,
): boolean {
  const then = checker.getApparentType(type).getProperty('then');
  return (
    then !== undefined &&
    checker.getTypeOfSymbolAtLocation(then, call).getCallSignatures().length > 0
  );
}

function isAsyncCall({ checker }: ImplementationState, call: TsCall): boolean {
  const last = ts.isCallExpression(call) ? call.arguments.at(-1) : undefined;
  if (last !== undefined && (ts.isArrowFunction(last) || ts.isFunctionExpression(last))) {
    return true;
  }
  const type = checker.getTypeAtLocation(call);
  const members = type.isUnion() ? type.types : [type];
  return (
    (type.flags & ts.TypeFlags.Any) !== 0 ||
    members.some((member) => hasCallableThen(checker, member, call))
  );
}

function asyncGate(state: ImplementationState, { call, view }: Site): AsyncCheck {
  return function isAsync(builder: boolean): boolean {
    const used = !builder || isTerminalMethod(view.method) || isTsConsumed(call);
    return used && isAsyncCall(state, call);
  };
}

function libraryEffects(
  state: ImplementationState,
  site: Site,
  declarations: readonly (TypeScript.Node | undefined)[],
): Effects | undefined {
  const isAsync = asyncGate(state, site);
  const { view } = site;
  const found = declarations
    .filter((declaration) => declaration !== undefined)
    .map((declaration) => declarationPackage(state, declaration))
    .filter((pkg) => pkg !== undefined)
    .map((pkg): readonly [string, ReturnType<typeof libraryKind>] => [
      pkg,
      libraryKind(pkg, view, isAsync),
    ])
    .find(([, kind]) => kind !== undefined);
  return found === undefined ? undefined : directEffects(found[1], found[0], view);
}

function requiredModule(declaration: TypeScript.Node): string | undefined {
  const variable = chainOf<TypeScript.Node>(declaration, (node) => node.parent).find(
    ts.isVariableDeclaration,
  );
  const init = variable?.initializer;
  const isRequire =
    init !== undefined &&
    ts.isCallExpression(init) &&
    ts.isIdentifier(init.expression) &&
    init.expression.text === 'require' &&
    init.arguments.length === 1;
  const [argument] = isRequire ? init.arguments : [];
  return argument !== undefined && ts.isStringLiteral(argument) ? argument.text : undefined;
}

function importedPackage(
  { checker }: ImplementationState,
  root: TypeScript.Identifier | undefined,
): string | undefined {
  const declaration =
    root === undefined ? undefined : checker.getSymbolAtLocation(root)?.declarations?.[0];
  if (declaration === undefined) {
    return undefined;
  }
  const statement = chainOf<TypeScript.Node>(declaration, (node) => node.parent).find(
    ts.isImportDeclaration,
  );
  return statement !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
    ? statement.moduleSpecifier.text
    : requiredModule(declaration);
}

function namedEffects(state: ImplementationState, site: Site): Resolved {
  const { view } = site;
  const pkg = importedPackage(state, view.root);
  const kind = pkg === undefined ? undefined : libraryKind(pkg, view, asyncGate(state, site));
  return kind === undefined
    ? { view, effects: directEffects(namedKind(view), pkg, view), guessed: true }
    : { view, effects: directEffects(kind, pkg, view) };
}

function libraryCallEffects(
  state: ImplementationState,
  site: Site,
  declarations: readonly (TypeScript.Node | undefined)[],
): Effects {
  const fetched = site.view.names.length === 1 && namedKind(site.view) === 'remote';
  return fetched
    ? directEffects('remote', undefined, site.view)
    : (libraryEffects(state, site, declarations) ?? new Map<string, string[]>());
}

function projectCall(
  state: ImplementationState,
  site: Site,
  declaration: TypeScript.NamedDeclaration,
): Resolved {
  const fn = functionLike(declaration);
  const targets = fn === undefined ? implementationsOf(state, declaration) : [fn];
  return targets.length === 0 ? namedEffects(state, site) : { view: site.view, targets };
}

export function resolveCall(state: ImplementationState, call: TsCall): Resolved {
  const site: Site = { call, view: tsCallView(call, state.checker) };
  const { callee, name, receiver } = calleeParts(call);
  const declaration = calleeDeclaration(state.checker, name);
  if (declaration === undefined) {
    return namedEffects(state, site);
  }
  const fn = functionLike(declaration);
  if (fn !== undefined && declarationPackage(state, declaration) === undefined) {
    return { view: site.view, targets: [fn] };
  }
  const receiverType = receiver === undefined ? undefined : typeDeclaration(state, receiver);
  const calleeType = typeDeclaration(state, callee);
  if (declarationPackage(state, declaration) !== undefined) {
    const effects = libraryCallEffects(state, site, [receiverType, declaration, calleeType]);
    return { view: site.view, effects };
  }
  const typed = libraryEffects(state, site, [calleeType, receiverType]);
  return typed === undefined
    ? projectCall(state, site, declaration)
    : { view: site.view, effects: typed };
}

function containerName(declaration: TypeScript.Declaration): string | undefined {
  const container = declaration.parent;
  const named = ts.isClassLike(container) || ts.isInterfaceDeclaration(container);
  return named ? container.name?.text : undefined;
}

export function calleeOrigin(state: ImplementationState, call: TsCall): CalleeOrigin | undefined {
  const declaration = calleeDeclaration(state.checker, calleeParts(call).name);
  return declaration === undefined
    ? undefined
    : { pkg: declarationPackage(state, declaration), owner: containerName(declaration) };
}
