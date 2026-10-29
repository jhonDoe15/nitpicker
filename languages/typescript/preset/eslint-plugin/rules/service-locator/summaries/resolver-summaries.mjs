import path from 'node:path';
import ts from 'typescript';
import { chainOf, depthFirst } from '../../../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../../../syntax/children.mjs';
import { directLookup } from '../lookup-sites.mjs';
import { bodyParts, functionsOf, referenceName, referenceOf } from './function-shapes.mjs';
import { isInRegistration } from './registrations.mjs';

function isProjectSource(program, source) {
  return !source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source);
}

function projectDirectory(program) {
  const config = program.getCompilerOptions().configFilePath;
  return typeof config === 'string' ? path.dirname(config) : program.getCurrentDirectory();
}

function relativeFile(context, source) {
  const relative = path.relative(projectDirectory(context.program), source.fileName);
  return relative.startsWith('..') ? source.fileName : relative.split(path.sep).join('/');
}

function directEvidence(context, node) {
  const api = directLookup(node, context.checker);
  return api === undefined || isInRegistration(context, node)
    ? undefined
    : { api, file: relativeFile(context, node.getSourceFile()) };
}

function resolvedCallees(context, node) {
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

function parameterDeclarations(fn) {
  const owners = ts.isClassLike(fn) ? fn.members.filter(ts.isConstructorDeclaration) : [fn];
  return new Set(owners.flatMap((owner) => [...(owner.parameters ?? [])]));
}

function refersToParameter(context, node, parameters) {
  return [...depthFirst(node, syntaxChildren)].some((part) => {
    const declaration = ts.isIdentifier(part)
      ? context.checker.getSymbolAtLocation(part)?.valueDeclaration
      : undefined;
    const parameter =
      declaration === undefined ? undefined : ts.findAncestor(declaration, ts.isParameter);
    return parameter !== undefined && parameters.has(parameter);
  });
}

function outermost(node) {
  return chainOf(node, (current) =>
    ts.isParenthesizedExpression(current.parent) || ts.isNonNullExpression(current.parent)
      ? current.parent
      : undefined,
  ).at(-1);
}

function forwardsToLookup(context, node, parameters) {
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
  return ts.isElementAccessExpression(parent) && parent.expression === site
    ? refersToParameter(context, parent.argumentExpression, parameters)
    : true;
}

function forwardsToCallee(context, node, parameters) {
  return referenceOf(node)?.mode !== 'call'
    ? true
    : (node.arguments ?? []).some((argument) => refersToParameter(context, argument, parameters));
}

function scanBody(context, fn) {
  const parameters = parameterDeclarations(fn);
  const nodes = bodyParts(fn).flatMap((part) => [...depthFirst(part, syntaxChildren)]);
  const callees = [];
  for (const node of nodes) {
    const evidence = directEvidence(context, node);
    if (evidence !== undefined && forwardsToLookup(context, node, parameters)) {
      return { evidence, callees };
    }
    const found = evidence === undefined ? resolvedCallees(context, node) : [];
    if (found.length > 0 && forwardsToCallee(context, node, parameters)) {
      callees.push(...found);
    }
  }
  return { callees };
}

function isKnownClean(context, fn) {
  return context.summaries.has(fn) && context.summaries.get(fn) === undefined;
}

function summaryOf(context, fn) {
  return context.summaries.has(fn)
    ? { evidence: context.summaries.get(fn), callees: [] }
    : scanBody(context, fn);
}

function enqueue(context, { queue, parents }, { fn, callees }) {
  for (const callee of callees) {
    if (!parents.has(callee) && !isKnownClean(context, callee)) {
      parents.set(callee, fn);
      queue.push(callee);
    }
  }
}

function searchFrom(context, start) {
  const queue = [start];
  const parents = new Map();
  parents.set(start, undefined);
  for (const fn of queue) {
    const { evidence, callees } = summaryOf(context, fn);
    if (evidence !== undefined) {
      return { evidence, path: chainOf(fn, (current) => parents.get(current)) };
    }
    enqueue(context, { queue, parents }, { fn, callees });
  }
  return { searched: queue };
}

function evidenceOf(context, fn) {
  if (!context.summaries.has(fn)) {
    const { evidence, path: found = [], searched = [] } = searchFrom(context, fn);
    for (const visited of evidence === undefined ? searched : found) {
      context.summaries.set(visited, evidence);
    }
  }
  return context.summaries.get(fn);
}

function lookupAt(context, node) {
  const direct = directEvidence(context, node);
  if (direct !== undefined) {
    return { kind: 'lookup', ...direct };
  }
  const evidence = resolvedCallees(context, node)
    .map((fn) => evidenceOf(context, fn))
    .find((found) => found !== undefined);
  return evidence === undefined
    ? undefined
    : { kind: 'wrapper', name: referenceName(referenceOf(node).target), ...evidence };
}

export function createResolverSummaries({ program }) {
  const context = {
    program,
    checker: program.getTypeChecker(),
    summaries: new Map(),
    memo: new Map(),
  };
  return { lookupAt: (node) => lookupAt(context, node) };
}
