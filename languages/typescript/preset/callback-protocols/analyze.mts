import type TypeScript from 'typescript';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import {
  depthFirst,
  projectFilesUnder,
  syntaxChildren,
} from '../architecture/typed/syntax-views.mts';
import type { Layout } from '../architecture/typed/boundary-types.mts';
import { callbackProtocolContracts } from './contracts.mts';
import type {
  Bindings,
  CallbackFinding,
  Contract,
  FunctionLike,
  OptionProperty,
} from './callback-types.mts';
import {
  unwrap,
  invokedReadName,
  resolveCallback,
  callbackBindings,
  functionLike,
  calleeName,
} from './bindings.mts';
import { accessPath, constructedTarget, optionProperties } from './bound-values.mts';
import { defaultResolvedLayout as untypedDefaultLayout } from '../layout.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ts = typescriptApi();

const defaultResolvedLayout: Layout = untypedDefaultLayout;

type Report = (rule: string, node: TypeScript.Node, callee: string) => void;

type Frame = {
  readonly node: TypeScript.Node;
  readonly bindings: Bindings;
  readonly active: Set<FunctionLike>;
};

function createReporter(
  tree: TypeScript.SourceFile,
  file: string,
  findings: CallbackFinding[],
): Report {
  const emitted = new Set();
  return (rule, node, callee) => {
    const key = `${rule}:${String(node.getStart(tree))}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const location = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    findings.push({ rule, file, line: location.line + 1, column: location.character + 1, callee });
  };
}

function calledFrame(frame: Frame): Frame[] {
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

function callbackChildren(frame: Frame): Frame[] {
  const nested = calledFrame(frame);
  const children = functionLike(frame.node) ? [] : syntaxChildren(frame.node);
  return [...nested, ...children.map((node) => ({ ...frame, node }))];
}

function inspectSource(
  callback: FunctionLike,
  { target, contract }: { readonly target: string; readonly contract: Contract },
  report: Report,
): void {
  if (!callback.body) return;
  const root: Frame = { node: callback.body, bindings: new Map(), active: new Set([callback]) };
  for (const { node, bindings } of depthFirst(root, callbackChildren)) {
    if (!ts.isCallExpression(node)) continue;
    const invoked = unwrap(node.expression);
    const readName = invokedReadName(invoked);
    if (
      readName &&
      contract.snapshotReadMethods.includes(readName) &&
      (ts.isPropertyAccessExpression(invoked) || ts.isElementAccessExpression(invoked)) &&
      accessPath(invoked.expression, bindings) === target
    ) {
      report('source-loader-does-not-merge-published-state', node, contract.callee);
    }
  }
}

function inspectProperty(
  property: OptionProperty,
  { contract, target }: { readonly contract: Contract; readonly target: string | undefined },
  report: Report,
): void {
  if (
    property.name !== undefined &&
    contract.externalPublicationCallbacks.includes(property.name)
  ) {
    report('publication-owner-does-not-commit-external-state', property.node, contract.callee);
  }
  const correlated = contract.correlatedCallbacks.find((item) => item.name === property.name);
  const callback = resolveCallback(property.value, new Map());
  if (correlated && callback && callback.parameters.length <= correlated.inputIndex) {
    report('correlated-callback-declares-correlation-input', property.node, contract.callee);
  }
  if (
    callback &&
    target &&
    property.name !== undefined &&
    contract.sourceCallbacks.includes(property.name)
  )
    inspectSource(callback, { target, contract }, report);
}

function inspectInvocation(
  node: TypeScript.Node,
  contracts: readonly Contract[],
  report: Report,
): void {
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
  source: string,
  {
    file = 'input.ts',
    contracts = callbackProtocolContracts,
  }: { readonly file?: string; readonly contracts?: readonly Contract[] } = {},
): CallbackFinding[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const findings: CallbackFinding[] = [];
  const report = createReporter(tree, file, findings);
  for (const node of depthFirst(tree, syntaxChildren)) inspectInvocation(node, contracts, report);
  return findings;
}

export function analyzeProductionCallbacks({
  layout = defaultResolvedLayout,
  sourceRoot = layout.sourceRoot,
  displayRoot = sourceRoot,
  contracts = callbackProtocolContracts,
}: {
  readonly layout?: Layout;
  readonly sourceRoot?: string;
  readonly displayRoot?: string;
  readonly contracts?: readonly Contract[];
} = {}): { readonly filesScanned: number; readonly findings: CallbackFinding[] } {
  function skipDirectory(_absolute: string, entry: { readonly name: string }): boolean {
    return /^(?:__tests__|tests|node_modules)$/.test(entry.name);
  }
  const files = existsSync(sourceRoot)
    ? [...projectFilesUnder(sourceRoot, { skipDirectory })]
        .filter((fullPath) => {
          const relative = path.relative(sourceRoot, fullPath).replaceAll('\\', '/');
          return (
            layout.isSourceFile(path.posix.join(layout.sourceRoot, relative)) &&
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
