import { depthFirst } from '../../../../shared/traversal.mjs';
import { filesUnder } from '../../../../shared/filesystem.mjs';
import { syntaxChildren } from '../syntax/children.mjs';
import { callbackProtocolContracts } from './contracts.mjs';
import ts from 'typescript';
import {
  unwrap,
  invokedReadName,
  accessPath,
  resolveCallback,
  callbackBindings,
  functionLike,
  calleeName,
  optionProperties,
  constructedTarget,
} from './bindings.mjs';
import { defaultResolvedLayout } from '../layout.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function createReporter(tree, file, findings) {
  const emitted = new Set();
  return (rule, node, callee) => {
    const key = `${rule}:${node.getStart(tree)}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const location = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    findings.push({ rule, file, line: location.line + 1, column: location.character + 1, callee });
  };
}

function calledFrame(frame) {
  if (!ts.isCallExpression(frame.node)) return [];
  const fn = resolveCallback(unwrap(frame.node.expression), frame.bindings);
  if (!fn?.body || frame.active.has(fn)) return [];
  return [
    {
      node: fn.body,
      bindings: callbackBindings(fn, frame.node, frame.bindings),
      active: new Set([...frame.active, fn]),
    },
  ];
}

function callbackChildren(frame) {
  const nested = calledFrame(frame);
  const children = functionLike(frame.node) ? [] : syntaxChildren(frame.node);
  return [...nested, ...children.map((node) => ({ ...frame, node }))];
}

function inspectSource(callback, { target, contract }, report) {
  if (!callback.body) return;
  const root = { node: callback.body, bindings: new Map(), active: new Set([callback]) };
  for (const { node, bindings } of depthFirst(root, callbackChildren)) {
    if (!ts.isCallExpression(node)) continue;
    const invoked = unwrap(node.expression);
    const readName = invokedReadName(invoked);
    if (
      readName &&
      contract.snapshotReadMethods.includes(readName) &&
      accessPath(invoked.expression, bindings) === target
    ) {
      report('source-loader-does-not-merge-published-state', node, contract.callee);
    }
  }
}

function inspectProperty(property, { contract, target }, report) {
  if (contract.externalPublicationCallbacks.includes(property.name)) {
    report('publication-owner-does-not-commit-external-state', property.node, contract.callee);
  }
  const correlated = contract.correlatedCallbacks.find((item) => item.name === property.name);
  const callback = resolveCallback(property.value, new Map());
  if (correlated && callback && callback.parameters.length <= correlated.inputIndex) {
    report('correlated-callback-declares-correlation-input', property.node, contract.callee);
  }
  if (callback && target && contract.sourceCallbacks.includes(property.name))
    inspectSource(callback, { target, contract }, report);
}

function inspectInvocation(node, contracts, report) {
  if (!ts.isNewExpression(node) && !ts.isCallExpression(node)) return;
  const contract = contracts.find((item) => item.callee === calleeName(node.expression));
  if (!contract) return;
  const options = node.arguments?.[contract.optionsArgument];
  const target = constructedTarget(node);
  for (const property of options ? optionProperties(options, new Map()) : []) {
    inspectProperty(property, { contract, target }, report);
  }
}

export function analyzeCallbackProtocols(
  source,
  { file = 'input.ts', contracts = callbackProtocolContracts } = {},
) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const findings = [];
  const report = createReporter(tree, file, findings);
  for (const node of depthFirst(tree, syntaxChildren)) inspectInvocation(node, contracts, report);
  return findings;
}

export function analyzeProductionCallbacks({
  layout = defaultResolvedLayout,
  sourceRoot = layout.sourceRoot,
  displayRoot = sourceRoot,
  contracts = callbackProtocolContracts,
} = {}) {
  function skipDirectory(_absolute, entry) {
    return /^(?:__tests__|tests|dist|build|node_modules)$/.test(entry.name);
  }
  const files = existsSync(sourceRoot)
    ? [...filesUnder(sourceRoot, { skipDirectory })]
        .filter((fullPath) => {
          const relative = path.relative(sourceRoot, fullPath).replaceAll('\\', '/');
          return (
            layout.isSourceFile(`${layout.sourceRoot}/${relative}`) &&
            !layout.isExcluded(path.posix.join(displayRoot.replaceAll('\\', '/'), relative))
          );
        })
        .sort()
    : [];
  const findings = files.flatMap((file) =>
    analyzeCallbackProtocols(readFileSync(file, 'utf8'), { file, contracts }),
  );
  return { filesScanned: files.length, findings };
}
