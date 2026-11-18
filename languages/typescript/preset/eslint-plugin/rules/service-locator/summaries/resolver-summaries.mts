import path from 'node:path';
import type TypeScript from 'typescript';
import { chainOf, depthFirst } from '../../typed/node-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import type { ContainerApi } from '../container-apis.mts';
import { directLookup } from '../lookup-sites.mts';
import {
  bodyParts,
  functionsOf,
  referenceName,
  referenceOf,
  syntaxChildren,
  type ResolvedFunction,
} from './function-shapes.mts';
import { isInRegistration, type RegistrationContext } from './registrations.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

type Evidence = { readonly api: ContainerApi; readonly file: string };
type Context = RegistrationContext & {
  readonly summaries: Map<ResolvedFunction, Evidence | undefined>;
};
type ScanResult = {
  readonly evidence?: Evidence | undefined;
  readonly callees: ResolvedFunction[];
};
type SearchResult = {
  readonly evidence?: Evidence | undefined;
  readonly path?: ResolvedFunction[];
  readonly searched?: ResolvedFunction[];
};
type Frontier = {
  readonly queue: ResolvedFunction[];
  readonly parents: Map<ResolvedFunction, ResolvedFunction | undefined>;
};
export type LookupResult = Evidence & {
  readonly kind: 'lookup' | 'wrapper';
  readonly name?: string;
};

function isProjectSource(program: TypeScript.Program, source: TypeScript.SourceFile): boolean {
  return !(source.isDeclarationFile || program.isSourceFileFromExternalLibrary(source));
}

function projectDirectory(program: TypeScript.Program): string {
  const config = Reflect.get(program.getCompilerOptions(), 'configFilePath');
  return typeof config === 'string' ? path.dirname(config) : program.getCurrentDirectory();
}

function relativeFile(context: Context, source: TypeScript.SourceFile): string {
  const relative = path.relative(projectDirectory(context.program), source.fileName);
  return relative.startsWith('..') ? source.fileName : relative.split(path.sep).join('/');
}

function directEvidence(context: Context, node: TypeScript.Node): Evidence | undefined {
  const api = directLookup(node, context.checker);
  return api === undefined || isInRegistration(context, node)
    ? undefined
    : { api, file: relativeFile(context, node.getSourceFile()) };
}

function resolvedCallees(context: Context, node: TypeScript.Node): ResolvedFunction[] {
  const reference = referenceOf(node);
  if (reference === undefined) {
    return [];
  }
  const callees = functionsOf(context.checker, reference.target, reference.mode).filter((fn) =>
    isProjectSource(context.program, fn.getSourceFile()),
  );
  return callees.length === 0 || isInRegistration(context, node) ? [] : callees;
}

const FUNCTION_METHODS = new Set(['call', 'apply', 'bind']);

function parameterDeclarations(fn: ResolvedFunction): Set<TypeScript.ParameterDeclaration> {
  const owners = ts.isClassLike(fn) ? fn.members.filter(ts.isConstructorDeclaration) : [fn];
  return new Set(owners.flatMap((owner) => [...owner.parameters]));
}

function refersToParameter(
  context: Context,
  node: TypeScript.Node,
  parameters: ReadonlySet<TypeScript.ParameterDeclaration>,
): boolean {
  return [...depthFirst<TypeScript.Node>(node, syntaxChildren)].some((part) => {
    const declaration = ts.isIdentifier(part)
      ? context.checker.getSymbolAtLocation(part)?.valueDeclaration
      : undefined;
    const parameter =
      declaration === undefined ? undefined : ts.findAncestor(declaration, ts.isParameter);
    return parameter !== undefined && parameters.has(parameter);
  });
}

function outermost(node: TypeScript.Node): TypeScript.Node {
  return (
    chainOf<TypeScript.Node>(node, (current) =>
      ts.isParenthesizedExpression(current.parent) || ts.isNonNullExpression(current.parent)
        ? current.parent
        : undefined,
    ).at(-1) ?? node
  );
}

function forwardsToLookup(
  context: Context,
  node: TypeScript.Node,
  parameters: ReadonlySet<TypeScript.ParameterDeclaration>,
): boolean {
  if (ts.isBindingElement(node)) {
    return true;
  }
  const site = outermost(node);
  const { parent } = site;
  if (ts.isCallExpression(parent) && parent.expression === site) {
    return parent.arguments.some((argument) => refersToParameter(context, argument, parameters));
  }
  if (ts.isPropertyAccessExpression(parent) && parent.expression === site) {
    return FUNCTION_METHODS.has(parent.name.text);
  }
  return (
    !(ts.isElementAccessExpression(parent) && parent.expression === site) ||
    refersToParameter(context, parent.argumentExpression, parameters)
  );
}

function forwardsToCallee(
  context: Context,
  node: TypeScript.Node,
  parameters: ReadonlySet<TypeScript.ParameterDeclaration>,
): boolean {
  const args: readonly TypeScript.Node[] =
    ts.isCallExpression(node) || ts.isNewExpression(node) ? (node.arguments ?? []) : [];
  return (
    referenceOf(node)?.mode !== 'call' ||
    args.some((argument) => refersToParameter(context, argument, parameters))
  );
}

function scanBody(context: Context, fn: ResolvedFunction): ScanResult {
  const parameters = parameterDeclarations(fn);
  const nodes = bodyParts(fn).flatMap((part) => [
    ...depthFirst<TypeScript.Node>(part, syntaxChildren),
  ]);
  const callees: ResolvedFunction[] = [];
  for (const node of nodes) {
    const evidence = directEvidence(context, node);
    if (evidence !== undefined && forwardsToLookup(context, node, parameters)) {
      return { evidence, callees };
    }
    const found = evidence === undefined ? resolvedCallees(context, node) : [];
    if (found.length > 0 && forwardsToCallee(context, node, parameters)) {
      appendAll(callees, found);
    }
  }
  return { callees };
}

function isKnownClean(context: Context, fn: ResolvedFunction): boolean {
  return context.summaries.has(fn) && context.summaries.get(fn) === undefined;
}

function summaryOf(context: Context, fn: ResolvedFunction): ScanResult {
  return context.summaries.has(fn)
    ? { evidence: context.summaries.get(fn), callees: [] }
    : scanBody(context, fn);
}

function enqueue(
  context: Context,
  { queue, parents }: Frontier,
  { fn, callees }: { readonly fn: ResolvedFunction; readonly callees: readonly ResolvedFunction[] },
): void {
  for (const callee of callees) {
    if (!(parents.has(callee) || isKnownClean(context, callee))) {
      parents.set(callee, fn);
      queue.push(callee);
    }
  }
}

function searchFrom(context: Context, start: ResolvedFunction): SearchResult {
  const queue = [start];
  const parents = new Map<ResolvedFunction, ResolvedFunction | undefined>();
  parents.set(start, undefined);
  for (const fn of queue) {
    const { evidence, callees } = summaryOf(context, fn);
    if (evidence !== undefined) {
      return { evidence, path: chainOf<ResolvedFunction>(fn, (current) => parents.get(current)) };
    }
    enqueue(context, { queue, parents }, { fn, callees });
  }
  return { searched: queue };
}

function evidenceOf(context: Context, fn: ResolvedFunction): Evidence | undefined {
  if (!context.summaries.has(fn)) {
    const { evidence, path: found = [], searched = [] } = searchFrom(context, fn);
    for (const visited of evidence === undefined ? searched : found) {
      context.summaries.set(visited, evidence);
    }
  }
  return context.summaries.get(fn);
}

function lookupAt(context: Context, node: TypeScript.Node): LookupResult | undefined {
  const direct = directEvidence(context, node);
  if (direct !== undefined) {
    return { kind: 'lookup', ...direct };
  }
  const evidence = resolvedCallees(context, node)
    .map((fn) => evidenceOf(context, fn))
    .find((found) => found !== undefined);
  const reference = referenceOf(node);
  return evidence === undefined || reference === undefined
    ? undefined
    : { kind: 'wrapper', name: referenceName(reference.target), ...evidence };
}

export function createResolverSummaries({ program }: { readonly program: TypeScript.Program }): {
  readonly lookupAt: (node: TypeScript.Node) => LookupResult | undefined;
} {
  const context: Context = {
    program,
    checker: program.getTypeChecker(),
    summaries: new Map(),
    memo: new Map(),
  };
  return { lookupAt: (node) => lookupAt(context, node) };
}
