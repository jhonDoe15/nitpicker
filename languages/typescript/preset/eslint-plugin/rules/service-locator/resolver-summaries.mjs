import path from 'node:path';
import ts from 'typescript';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../../syntax/children.mjs';
import { directLookup, isInRegistrationCallback } from './lookup-sites.mjs';

function functionOf(declaration) {
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) {
    return declaration.body === undefined ? undefined : declaration;
  }
  if (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration)) {
    const { initializer } = declaration;
    return initializer !== undefined &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
      ? initializer
      : undefined;
  }
  return undefined;
}

function calleeName(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    return callee;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name : undefined;
}

function isProjectSource({ program, isRoot }, source) {
  return (
    !source.isDeclarationFile &&
    !program.isSourceFileFromExternalLibrary(source) &&
    !isRoot(source.fileName)
  );
}

function calledFunction(context, node) {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const name = calleeName(node);
  let symbol = name === undefined ? undefined : context.checker.getSymbolAtLocation(name);
  if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    symbol = context.checker.getAliasedSymbol(symbol);
  }
  return (symbol?.declarations ?? [])
    .map(functionOf)
    .find((fn) => fn !== undefined && isProjectSource(context, fn.getSourceFile()));
}

function directEvidence(context, node) {
  const api = directLookup(node, context.checker);
  return api === undefined || isInRegistrationCallback(node)
    ? undefined
    : { api, file: path.basename(node.getSourceFile().fileName) };
}

function resolvedCallee(context, node) {
  const callee = calledFunction(context, node);
  return callee === undefined || isInRegistrationCallback(node) ? undefined : callee;
}

function searchFrom(context, start) {
  const queue = [start];
  const seen = new Set(queue);
  for (const fn of queue) {
    for (const node of depthFirst(fn.body, syntaxChildren)) {
      const evidence = directEvidence(context, node);
      if (evidence !== undefined) {
        return { evidence };
      }
      const callee = resolvedCallee(context, node);
      if (callee !== undefined && !seen.has(callee)) {
        seen.add(callee);
        queue.push(callee);
      }
    }
  }
  return { searched: queue };
}

function evidenceOf(context, fn) {
  if (!context.summaries.has(fn)) {
    const { evidence, searched = [fn] } = searchFrom(context, fn);
    for (const visited of evidence === undefined ? searched : [fn]) {
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
  const callee = resolvedCallee(context, node);
  const evidence = callee === undefined ? undefined : evidenceOf(context, callee);
  return evidence === undefined
    ? undefined
    : { kind: 'wrapper', name: calleeName(node).text, ...evidence };
}

export function createResolverSummaries({ program, isRoot }) {
  const context = { program, isRoot, checker: program.getTypeChecker(), summaries: new Map() };
  return { lookupAt: (node) => lookupAt(context, node) };
}
