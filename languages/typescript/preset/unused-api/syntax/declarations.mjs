import { ts } from '../../../typescript-api/typescript-api.mjs';
import {
  candidatesOf,
  isComponentCandidate,
  isOptionsParameter,
  isWrapperCall,
} from './candidates.mjs';
import { ownedMembers } from './members.mjs';
import { unwrapExpression } from './passes.mjs';
import { addAlias, createRegistry, register, targetOf } from './resolve.mjs';
import { ownerType, sharedTypes } from './shared-types.mjs';

function exportedDeclarations(sourceFile, checker) {
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

function parameterTarget({ candidate, file, context, index }) {
  const parameter = candidate.fn.parameters[index];
  const type = context.checker.getTypeAtLocation(parameter);
  if (type.flags & ts.TypeFlags.TypeParameter) return undefined;
  const members = ownedMembers({ checker: context.checker, type, owned: context.owned });
  return members.size === 0
    ? undefined
    : { name: candidate.name, path: file.path, package: file.package, refs: [], members, index };
}

function targetFor({ candidate, file, context, exported }) {
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

function fileTargets({ fileName, file, context }) {
  const sourceFile = context.program.getSourceFile(fileName);
  const exported = exportedDeclarations(sourceFile, context.checker);
  return candidatesOf(sourceFile, context.checker).flatMap((candidate) => {
    const target = targetFor({ candidate, file, context, exported });
    return target === undefined ? [] : [{ target, keyNodes: candidate.keyNodes }];
  });
}

function withoutSharedMembers(entries, context) {
  const owners = new Set(
    entries.flatMap(({ target }) => [...target.members.values()].map(ownerType)).filter(Boolean),
  );
  const shared = sharedTypes(context, owners);
  return entries
    .map(({ target, keyNodes }) => {
      const kept = [...target.members].filter(([, member]) => !shared.has(ownerType(member)));
      return { target: { ...target, members: new Map(kept) }, keyNodes };
    })
    .filter(({ target }) => target.members.size > 0);
}

/**
 * Components and exported functions with an options parameter, keyed by their declarations. A
 * member of a named type that other places also use (a shared domain type) is not checked.
 */
export function collectTargets(context) {
  const registry = createRegistry();
  const entries = [...context.owned].flatMap(([fileName, file]) =>
    fileTargets({ fileName, file, context }),
  );
  for (const entry of withoutSharedMembers(entries, context)) register(registry, entry);
  return registry;
}

function aliasOf(statement) {
  if (ts.isExportAssignment(statement))
    return [{ node: statement, name: 'default', value: statement.expression }];
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.flatMap((declaration) =>
    ts.isIdentifier(declaration.name) && declaration.initializer
      ? [{ node: declaration, name: declaration.name.text, value: declaration.initializer }]
      : [],
  );
}

export function wrappedReference(value) {
  const call = unwrapExpression(value);
  const argument = isWrapperCall(call) ? call.arguments[0] : undefined;
  const reference = argument === undefined ? undefined : unwrapExpression(argument);
  const isReference =
    reference !== undefined &&
    (ts.isIdentifier(reference) || ts.isPropertyAccessExpression(reference));
  return isReference ? reference : undefined;
}

function fileAliases(sourceFile, context) {
  return sourceFile.statements.flatMap(aliasOf).flatMap((statement) => {
    const reference = wrappedReference(statement.value);
    const target = reference === undefined ? undefined : targetOf(context, reference);
    return target === undefined ? [] : [{ target, node: statement.node, name: statement.name }];
  });
}

/** `const Y = memo(X)` and `export default memo(X)` render the props of X. */
export function registerWrapperAliases(context, registry) {
  const aliases = context.files.flatMap((sourceFile) =>
    fileAliases(sourceFile, { ...context, registry }),
  );
  for (const alias of aliases) addAlias(registry, alias);
}
