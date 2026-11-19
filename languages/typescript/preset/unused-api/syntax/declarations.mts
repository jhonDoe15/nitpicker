import type TypeScript from 'typescript';
import { typescriptApi } from '../../../adapters/typed/typescript-program.mts';
import type {
  Candidate,
  FileInfo,
  Registry,
  Target,
  TargetBase,
  TargetContext,
} from '../typed/context-types.mts';
import {
  bindingMembers,
  candidatesOf,
  isComponentCandidate,
  isOptionsParameter,
  isWrapperCall,
} from './candidates.mts';
import { isJavascriptFile } from '../context.mts';
import { ownedMembers } from './members.mts';
import { unwrapExpression } from './passes.mts';
import { addAlias, createRegistry, register, targetOf } from './resolve.mts';
import { ownerType, sharedTypes } from './shared-types.mts';

type TargetEntry = { readonly target: Target; readonly keyNodes: readonly TypeScript.Node[] };
type Alias = {
  readonly node: TypeScript.Node;
  readonly name: string;
  readonly value: TypeScript.Expression;
};

const ts = typescriptApi();

function exportedDeclarations(
  sourceFile: TypeScript.SourceFile,
  checker: TypeScript.TypeChecker,
): Set<TypeScript.Declaration> {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const symbols = moduleSymbol === undefined ? [] : checker.getExportsOfModule(moduleSymbol);
  return new Set(
    symbols.flatMap(
      (symbol) =>
        (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
          .declarations ?? [],
    ),
  );
}

function parameterMembers({
  parameter,
  context,
}: {
  readonly parameter: TypeScript.ParameterDeclaration;
  readonly context: TargetContext;
}): Map<string, TypeScript.Declaration> {
  if (isJavascriptFile(parameter.getSourceFile().fileName)) {
    return bindingMembers(parameter);
  }
  const type = context.checker.getTypeAtLocation(parameter);
  if (type.flags & ts.TypeFlags.TypeParameter) {
    return new Map();
  }
  return ownedMembers({ checker: context.checker, type, owned: context.owned });
}

function parameterTarget({
  candidate,
  file,
  context,
  index,
}: {
  readonly candidate: Candidate;
  readonly file: FileInfo;
  readonly context: TargetContext;
  readonly index: number;
}): TargetBase | undefined {
  const parameter = candidate.fn.parameters[index];
  if (parameter === undefined) {
    return undefined;
  }
  const members = parameterMembers({ parameter, context });
  return members.size === 0
    ? undefined
    : { name: candidate.name, path: file.path, package: file.package, refs: [], members, index };
}

function targetFor({
  candidate,
  file,
  context,
  exported,
}: {
  readonly candidate: Candidate;
  readonly file: FileInfo;
  readonly context: TargetContext;
  readonly exported: ReadonlySet<TypeScript.Node>;
}): Target | undefined {
  const fileName = candidate.fn.getSourceFile().fileName;
  if (isComponentCandidate({ candidate, fileName, react: context.react })) {
    const target =
      candidate.fn.parameters.length === 0
        ? undefined
        : parameterTarget({ candidate, file, context, index: 0 });
    return target && { ...target, kind: 'component' };
  }
  const index = candidate.fn.parameters.findIndex(isOptionsParameter);
  const isExported = candidate.keyNodes.some((node) => exported.has(node));
  const target =
    isExported && index !== -1 ? parameterTarget({ candidate, file, context, index }) : undefined;
  return target && { ...target, kind: 'function' };
}

function fileTargets({
  fileName,
  file,
  context,
}: {
  readonly fileName: string;
  readonly file: FileInfo;
  readonly context: TargetContext;
}): TargetEntry[] {
  const sourceFile = context.program.getSourceFile(fileName);
  if (sourceFile === undefined) {
    return [];
  }
  const exported = exportedDeclarations(sourceFile, context.checker);
  return candidatesOf(sourceFile, context.checker).flatMap((candidate) => {
    const target = targetFor({ candidate, file, context, exported });
    return target === undefined ? [] : [{ target, keyNodes: candidate.keyNodes }];
  });
}

function withoutSharedMembers(
  entries: readonly TargetEntry[],
  context: TargetContext,
): TargetEntry[] {
  const owners = new Set(
    entries
      .flatMap(({ target }) => [...target.members.values()].map(ownerType))
      .filter((owner) => owner !== undefined),
  );
  const shared = sharedTypes(context, owners);
  return entries
    .map(({ target, keyNodes }) => {
      const kept = [...target.members].filter(([, member]) => !shared.has(ownerType(member)));
      return { target: { ...target, members: new Map(kept) }, keyNodes };
    })
    .filter(({ target }) => target.members.size > 0);
}

export function collectTargets(context: TargetContext): Registry {
  const registry = createRegistry();
  const entries = [...context.owned].flatMap(([fileName, file]) =>
    fileTargets({ fileName, file, context }),
  );
  for (const entry of withoutSharedMembers(entries, context)) {
    register(registry, entry);
  }
  return registry;
}

function aliasOf(statement: TypeScript.Statement): Alias[] {
  if (ts.isExportAssignment(statement)) {
    return [{ node: statement, name: 'default', value: statement.expression }];
  }
  if (!ts.isVariableStatement(statement)) {
    return [];
  }
  return statement.declarationList.declarations.flatMap((declaration) =>
    ts.isIdentifier(declaration.name) && declaration.initializer
      ? [{ node: declaration, name: declaration.name.text, value: declaration.initializer }]
      : [],
  );
}

export function wrappedReference(
  value: TypeScript.Expression,
): TypeScript.Identifier | TypeScript.PropertyAccessExpression | undefined {
  const call = unwrapExpression(value);
  const argument = isWrapperCall(call) ? call.arguments[0] : undefined;
  const reference = argument === undefined ? undefined : unwrapExpression(argument);
  const isReference =
    reference !== undefined &&
    (ts.isIdentifier(reference) || ts.isPropertyAccessExpression(reference));
  return isReference ? reference : undefined;
}

function fileAliases(
  sourceFile: TypeScript.SourceFile,
  context: TargetContext & { readonly registry: Registry },
): { readonly target: Target; readonly node: TypeScript.Node; readonly name: string }[] {
  return sourceFile.statements.flatMap(aliasOf).flatMap((statement) => {
    const reference = wrappedReference(statement.value);
    const target = reference === undefined ? undefined : targetOf(context, reference);
    return target === undefined ? [] : [{ target, node: statement.node, name: statement.name }];
  });
}

export function registerWrapperAliases(context: TargetContext, registry: Registry): void {
  const aliases = context.files.flatMap((sourceFile) =>
    fileAliases(sourceFile, { ...context, registry }),
  );
  for (const alias of aliases) {
    addAlias(registry, alias);
  }
}
