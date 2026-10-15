import { filesUnder } from '../../../../shared/filesystem.mjs';
import { depthFirst } from '../../../../shared/traversal.mjs';
import { syntaxChildren } from '../syntax/children.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { isExcludedPath, normalizePath } from '../dependency-graph/cruise.mjs';
import { defaultResolvedLayout } from '../layout.mjs';

function parseSource(source, filename) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.mts') ? ts.ScriptKind.TS : ts.ScriptKind.TS,
  );
  if (sourceFile.parseDiagnostics?.length > 0) {
    const diagnostics = sourceFile.parseDiagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('; ');
    throw new SyntaxError(`Unable to parse ${filename}: ${diagnostics}`);
  }
  return sourceFile;
}

function location(sourceFile, node) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  return { start, end, lines: end - start + 1 };
}

function nodeName(sourceFile, node) {
  if (node.name !== undefined) {
    return node.name.getText(sourceFile);
  }
  if (ts.isConstructorDeclaration(node)) {
    return 'constructor';
  }
  if (ts.isVariableDeclaration(node.parent) || ts.isPropertyDeclaration(node.parent)) {
    return node.parent.name.getText(sourceFile);
  }
  return '<anonymous>';
}

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function isControlNode(node) {
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

function functionBodyMetrics(functionNode) {
  let statements = 0;
  let maxControlNesting = 0;

  function children({ node, depth }) {
    if (node !== functionNode && isFunctionNode(node)) return [];
    const nextDepth = node !== functionNode && isControlNode(node) ? depth + 1 : depth;
    return syntaxChildren(node).map((child) => ({ node: child, depth: nextDepth }));
  }
  if (functionNode.body === undefined) return { statements, maxControlNesting };
  for (const { node, depth } of depthFirst({ node: functionNode.body, depth: 0 }, children)) {
    if (node !== functionNode && isFunctionNode(node)) continue;
    if (node !== functionNode && ts.isStatement(node) && !ts.isBlock(node)) statements += 1;
    const nextDepth = node !== functionNode && isControlNode(node) ? depth + 1 : depth;
    maxControlNesting = Math.max(maxControlNesting, nextDepth);
  }
  return { statements, maxControlNesting };
}

export function analyzeSource(source, filename) {
  const sourceFile = parseSource(source, filename);
  const functions = [];
  const classes = [];

  for (const node of depthFirst(sourceFile, syntaxChildren)) {
    if (isFunctionNode(node)) {
      functions.push({
        source: normalizePath(filename),
        function: nodeName(sourceFile, node),
        ...location(sourceFile, node),
        parameters: node.parameters.length,
        ...functionBodyMetrics(node),
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

function productionFiles(root, displayRoot, layout) {
  if (!existsSync(root)) return [];
  function skipDirectory(absolute, entry) {
    return isExcludedPath(normalizePath(absolute)) || entry.name === '__tests__';
  }
  return [...filesUnder(root, { skipDirectory })]
    .filter((absolute) => {
      const relative = normalizePath(path.relative(root, absolute));
      return (
        !isExcludedPath(normalizePath(absolute)) &&
        layout.isSourceFile(`${layout.sourceRoot}/${relative}`) &&
        !layout.isExcluded(normalizePath(path.join(displayRoot, relative)))
      );
    })
    .sort();
}

function percentile(values, fraction) {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function distribution(entries, property) {
  const values = entries.map((entry) => entry[property]);
  return {
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    p95: percentile(values, 0.95),
    max: values.length === 0 ? undefined : Math.max(...values),
  };
}

function rank(entries, property) {
  return [...entries]
    .sort(
      (left, right) =>
        right[property] - left[property] ||
        left.source.localeCompare(right.source) ||
        (left.function ?? left.class).localeCompare(right.function ?? right.class),
    )
    .slice(0, 20);
}

export function analyzeProductionFiles(
  root,
  displayRoot = root,
  { layout = defaultResolvedLayout } = {},
) {
  const files = productionFiles(root, displayRoot, layout);
  const functions = [];
  const classes = [];
  let lines = 0;

  for (const file of files) {
    const displayPath = normalizePath(path.join(displayRoot, path.relative(root, file)));
    const analysis = analyzeSource(readFileSync(file, 'utf8'), displayPath);
    lines += analysis.lines;
    functions.push(...analysis.functions);
    classes.push(...analysis.classes);
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
  };
}
