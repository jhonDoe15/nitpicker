import type TypeScript from 'typescript';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { typescriptApi } from '../../adapters/typed/typescript-program.mts';
import { projectFilesUnder } from './typed/rule-views.mts';
import {
  defaultResolvedLayout,
  depthFirst,
  isExcludedPath,
  normalizePath,
  parseDiagnosticsOf,
  syntaxChildren,
} from './typed/analysis-views.mts';
import type { StructureLayout } from './typed/structure-types.mts';
import {
  curriedChain,
  functionUnits,
  isCurriedInner,
  isFunctionLike,
} from './units/function-units.mts';
import type { FunctionLike } from './units/function-unit-types.mts';
import type {
  AnalysisClass,
  AnalysisFunction,
  FunctionMetrics,
  Distribution,
  Measured,
  Metric,
  ProductionAnalysis,
  Ranked,
  SourceAnalysis,
  UnparsedSource,
  WalkStep,
} from './typed/analysis-types.mts';
import { appendAll, largest } from '../../../../shared/lists/lists.mts';
import { blockingParseDiagnostics } from '../syntax/diagnostics/legacy-scripts.mts';

const ts = typescriptApi();

function parseSource(source: string, filename: string): TypeScript.SourceFile {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const parseDiagnostics = blockingParseDiagnostics(filename, parseDiagnosticsOf(sourceFile));
  if (parseDiagnostics.length > 0) {
    const diagnostics = parseDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('; ');
    throw new SyntaxError(`Unable to parse ${filename}: ${diagnostics}`);
  }
  return sourceFile;
}

function location(
  sourceFile: TypeScript.SourceFile,
  node: TypeScript.Node,
): { start: number; end: number; lines: number } {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { start, end, lines: end - start + 1 };
}

function isControlNode(node: TypeScript.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isCatchClause(node)
  );
}

function isElseIf(node: TypeScript.Node, parent: TypeScript.Node): boolean {
  return ts.isIfStatement(node) && ts.isIfStatement(parent) && parent.elseStatement === node;
}

function functionBodyMetrics(functionNode: FunctionLike): FunctionMetrics {
  let statements = 0;
  let maxControlNesting = 0;

  function opensLevel(node: TypeScript.Node, parent: TypeScript.Node): boolean {
    return node !== functionNode && isControlNode(node) && !isElseIf(node, parent);
  }
  function children({ node, depth, parent }: WalkStep): WalkStep[] {
    if (node !== functionNode && isFunctionLike(node)) return [];
    const nextDepth = opensLevel(node, parent) ? depth + 1 : depth;
    return syntaxChildren(node).map((child) => ({ node: child, depth: nextDepth, parent: node }));
  }
  if (functionNode.body === undefined) return { statements, maxControlNesting };
  const root: WalkStep = { node: functionNode.body, depth: 0, parent: functionNode };
  for (const { node, depth, parent } of depthFirst(root, children)) {
    if (node !== functionNode && isFunctionLike(node)) continue;
    if (node !== functionNode && ts.isStatement(node) && !ts.isBlock(node)) statements += 1;
    const nextDepth = opensLevel(node, parent) ? depth + 1 : depth;
    maxControlNesting = Math.max(maxControlNesting, nextDepth);
  }
  return { statements, maxControlNesting };
}

export function analyzeSource(source: string, filename: string): SourceAnalysis {
  const sourceFile = parseSource(source, filename);
  const { names } = functionUnits(sourceFile);
  const functions: AnalysisFunction[] = [];
  const classes: AnalysisClass[] = [];

  for (const node of depthFirst(sourceFile, syntaxChildren)) {
    if (isFunctionLike(node) && !isCurriedInner(node)) {
      const chain = curriedChain(node);
      functions.push({
        source: normalizePath(filename),
        function: names.get(node),
        ...location(sourceFile, node),
        parameters: largest(chain.map((link) => link.parameters.length)),
        ...functionBodyMetrics(chain.at(-1) ?? node),
      });
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const members = [...node.members];
      classes.push({
        source: normalizePath(filename),
        class: node.name?.getText(sourceFile) ?? '<anonymous>',
        ...location(sourceFile, node),
        members: members.length,
        methods: members.filter(
          (member) =>
            ts.isMethodDeclaration(member) ||
            ts.isConstructorDeclaration(member) ||
            ts.isGetAccessorDeclaration(member) ||
            ts.isSetAccessorDeclaration(member),
        ).length,
      });
    }
  }

  return {
    lines: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1,
    functions,
    classes,
  };
}

function productionFiles(root: string, displayRoot: string, layout: StructureLayout): string[] {
  if (!existsSync(root)) return [];
  function projectRelative(absolute: string): string {
    return normalizePath(path.join(displayRoot, path.relative(root, absolute)));
  }
  function skipDirectory(absolute: string, entry: { readonly name: string }): boolean {
    return isExcludedPath(projectRelative(absolute)) || entry.name === '__tests__';
  }
  return [...projectFilesUnder(root, { skipDirectory })]
    .filter((absolute) => {
      const relative = normalizePath(path.relative(root, absolute));
      return (
        !isExcludedPath(projectRelative(absolute)) &&
        layout.isSourceFile(`${layout.sourceRoot}/${relative}`) &&
        !layout.isExcluded(normalizePath(path.join(displayRoot, relative)))
      );
    })
    .sort();
}

function percentile(values: readonly number[], fraction: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function distribution(entries: readonly Measured[], property: Metric): Distribution {
  const values = entries.map((entry) => entry[property] ?? 0);
  return {
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95),
    max: values.length === 0 ? undefined : largest(values),
  };
}

function rank<Entry extends Ranked>(entries: readonly Entry[], property: Metric): Entry[] {
  return [...entries]
    .sort(
      (left, right) =>
        (right[property] ?? 0) - (left[property] ?? 0) ||
        left.source.localeCompare(right.source) ||
        (left.function ?? left.class ?? '').localeCompare(right.function ?? right.class ?? ''),
    )
    .slice(0, 20);
}

function analyzeParsableSource(source: string, filename: string): SourceAnalysis | UnparsedSource {
  try {
    return analyzeSource(source, filename);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { file: filename, reason: error.message.replace(`Unable to parse ${filename}: `, '') };
    }
    throw error;
  }
}

export function analyzeProductionFiles(
  root: string,
  displayRoot: string = root,
  { layout = defaultResolvedLayout }: { readonly layout?: StructureLayout } = {},
): ProductionAnalysis {
  const files = productionFiles(root, displayRoot, layout);
  const functions: AnalysisFunction[] = [];
  const classes: AnalysisClass[] = [];
  const unparsed: UnparsedSource[] = [];
  let lines = 0;

  for (const file of files) {
    const displayPath = normalizePath(path.join(displayRoot, path.relative(root, file)));
    const analysis = analyzeParsableSource(readFileSync(file, 'utf8'), displayPath);
    if ('reason' in analysis) {
      unparsed.push(analysis);
      continue;
    }
    lines += analysis.lines;
    appendAll(functions, analysis.functions);
    appendAll(classes, analysis.classes);
  }

  return {
    summary: { files: files.length, lines, functions: functions.length, classes: classes.length },
    distributions: {
      functionLines: distribution(functions, 'lines'),
      functionStatements: distribution(functions, 'statements'),
      functionControlNesting: distribution(functions, 'maxControlNesting'),
      functionParameters: distribution(functions, 'parameters'),
      classLines: distribution(classes, 'lines'),
      classMembers: distribution(classes, 'members'),
    },
    rankings: {
      functionLines: rank(functions, 'lines'),
      functionStatements: rank(functions, 'statements'),
      functionControlNesting: rank(functions, 'maxControlNesting'),
      functionParameters: rank(functions, 'parameters'),
      classLines: rank(classes, 'lines'),
      classMembers: rank(classes, 'members'),
    },
    functions,
    classes,
    unparsed,
  };
}
