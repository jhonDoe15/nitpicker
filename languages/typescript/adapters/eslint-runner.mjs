import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { PACKAGE_ROOT, SNAPSHOT_DIRECTORY_NAMES } from '../../../core/tooling/tool-resolution.mjs';
import {
  linkPolicyFile,
  lstatIfExists,
  removeOwnedLink,
} from '../../../core/tooling/policy-links.mjs';
import { eslintMessageWithHint, growthAdviceFor } from './eslint-hints.mjs';
import { readLayout } from '../preset/head-policy.mjs';
import { runLintEngine } from './lint-engine/lint-engine.mjs';
import { layoutTransformFor } from '../preset/tool-configs.mjs';
import {
  prepareSnapshotDependencies,
  removeSnapshotDependencies,
} from './static-checks-runner.mjs';

const DEFAULT_ESLINT_TIMEOUT_MS = 4 * 60 * 1000;
const TRUSTED_TOOL_ROOT = PACKAGE_ROOT;

const VALUE_ARGUMENTS = new Set([
  '--analyzer-name',
  '--project-root',
  '--policy-root',
  '--tool-root',
  '--live-project-root',
  '--config',
  '--timeout-ms',
  '--eslint-cli',
  '--environment',
]);

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const findings = runEslint(options);
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } catch (error) {
    process.stderr.write(
      `ESLint differential adapter failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

function runEslint(options) {
  const dependencyRoot = realpathSync(path.join(options.liveProjectRoot, 'node_modules'));
  if (!statSync(dependencyRoot).isDirectory()) {
    throw new Error(`Installed ESLint dependencies are missing at ${dependencyRoot}`);
  }

  let linkedDependencies = [];
  let installedPolicyFiles = [];
  let preparedDependencies;

  try {
    preparedDependencies = prepareSnapshotDependencies(options);
    if (options.policyRoot !== PACKAGE_ROOT) {
      linkedDependencies = linkDependencies({
        dependencyRoot,
        roots: [options.policyRoot],
      });
    }
    installedPolicyFiles = installPolicyFiles(options);
    const value = runLintEngine({
      options,
      projectConfigPath: installedPolicyFiles.at(0)?.targetPath,
      policyConfigPath: validatedContainedFile(
        options.policyRoot,
        options.configRelativePath,
        '--config',
      ).canonicalPath,
    });
    return normalizeEslintResults({
      value,
      projectRoot: options.projectRoot,
      analyzerName: options.analyzerName,
    });
  } finally {
    try {
      restorePolicyFiles(installedPolicyFiles);
    } finally {
      try {
        removeDependencyLinks(linkedDependencies);
      } finally {
        removeSnapshotDependencies(preparedDependencies);
      }
    }
  }
}

export function normalizeEslintResults({ value, projectRoot, analyzerName }) {
  if (!Array.isArray(value)) {
    throw new TypeError('ESLint JSON output must be an array');
  }

  const normalized = [];
  for (const [resultIndex, result] of value.entries()) {
    if (!isRecord(result) || typeof result.filePath !== 'string') {
      throw new TypeError(`ESLint result ${String(resultIndex)} must contain filePath`);
    }
    if (!Array.isArray(result.messages)) {
      throw new TypeError(`ESLint result ${String(resultIndex)} must contain messages`);
    }

    const projectFile = validatedProjectFile(projectRoot, result.filePath);
    const relativePath = projectFile.relativePath;
    if (result.messages.length === 0) {
      continue;
    }
    const source = readFileSync(projectFile.canonicalPath, 'utf8');
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(relativePath),
    );

    for (const [messageIndex, message] of result.messages.entries()) {
      const context = `ESLint result ${String(resultIndex)} message ${String(messageIndex)}`;
      normalized.push(
        normalizeMessage({
          message,
          context,
          analyzerName,
          relativePath,
          sourceFile,
        }),
      );
    }
  }
  return withRatchets(
    assignSemanticOccurrences(normalized.map(({ finding }) => finding)),
    normalized.map(({ plan }) => plan),
  );
}

function metricRules() {
  return {
    'nitpicker/cognitive-complexity': {
      pattern: /cognitive complexity of (\d+);/u,
      label: 'cognitive complexity',
    },
    complexity: { pattern: /complexity of (\d+)\./u, label: 'complexity' },
    'max-lines-per-function': { pattern: /too many lines \((\d+)\)/u, label: 'line count' },
    'max-statements': { pattern: /too many statements \((\d+)\)/u, label: 'statement count' },
    'max-params': { pattern: /too many parameters \((\d+)\)/u, label: 'parameter count' },
    'max-depth': { pattern: /nested too deeply \((\d+)\)/u, label: 'block nesting' },
  };
}

function metricOf(ruleId, messageText) {
  const rule = metricRules()[ruleId];
  const amount = rule === undefined ? undefined : rule.pattern.exec(messageText)?.[1];
  return amount === undefined ? undefined : { value: Number(amount), label: rule.label };
}

function countGroupOf(finding, plan) {
  return JSON.stringify([finding.rule, finding.path, finding.symbol, plan.kind, plan.key]);
}

function withRatchets(findings, plans) {
  const counts = new Map();
  const occurrences = new Map();
  for (const [index, finding] of findings.entries()) {
    const plan = plans[index];
    if (plan?.kind === 'count') {
      counts.set(countGroupOf(finding, plan), (counts.get(countGroupOf(finding, plan)) ?? 0) + 1);
    }
  }
  return findings.map((finding, index) => {
    const plan = plans[index];
    if (plan === undefined) {
      return finding;
    }
    if (plan.kind === 'count') {
      const growthAdvice = growthAdviceFor(finding.rule);
      return {
        ...finding,
        ratchet: {
          key: `count:${plan.key}`,
          value: counts.get(countGroupOf(finding, plan)),
          existingCodeOnly: true,
          ...(growthAdvice === undefined ? {} : { growthAdvice }),
        },
      };
    }
    const group = JSON.stringify([finding.rule, finding.path, finding.symbol]);
    const occurrence = (occurrences.get(group) ?? 0) + 1;
    occurrences.set(group, occurrence);
    return {
      ...finding,
      ratchet: {
        key: `metric:occurrence:${String(occurrence)}`,
        value: plan.value,
        worseMessage: `${finding.symbol ?? 'This function'} ${plan.label} grew from {base} to ${String(plan.value)}. Put new code in a new function.`,
      },
    };
  });
}

function normalizeMessage({ message, context, analyzerName, relativePath, sourceFile }) {
  if (!isRecord(message)) {
    throw new TypeError(`${context} must be an object`);
  }
  if (message.fatal === true) {
    throw new Error(
      `${context} is fatal: ${requiredString(message.message, `${context}.message`)}`,
    );
  }

  const messageText = requiredString(message.message, `${context}.message`);
  const ruleId =
    typeof message.ruleId === 'string' && message.ruleId.length > 0
      ? message.ruleId
      : nonRuleDiagnosticId(messageText, context);
  const { line, column, sourcePosition, endPosition } = reportedPositions(
    message,
    context,
    sourceFile,
  );
  const comment = commentAt(sourceFile.text, sourcePosition, endPosition);
  const locatedNode =
    comment === undefined
      ? findReportedNode(sourceFile, sourcePosition, endPosition)
      : findStartedNode(sourceFile, sourcePosition);
  const reportedNode = stableSyntaxAnchor(locatedNode);
  const nodeType = comment === undefined ? eslintNodeType(reportedNode) : 'Comment';
  const symbol = enclosingSymbol(reportedNode);
  const messageIdentity = messageIdentityOf(message, messageText);
  const metric = metricOf(ruleId, messageText);
  const finding = {
    tool: analyzerName,
    rule: ruleId,
    path: relativePath,
    identity: [
      `message:${messageIdentity}`,
      `node:${nodeType}`,
      `syntax:${comment === undefined ? syntaxFingerprint(reportedNode, nodeType) : commentFingerprint(comment)}`,
      ...(metric === undefined ? [] : [`value:${String(metric.value)}`]),
    ].join('|'),
    message: hintedMessage({ ruleId, messageText, relativePath, comment, locatedNode, sourceFile }),
    location: { line, column },
    classification: 'enforceable',
  };
  if (symbol !== undefined) {
    finding.symbol = symbol;
  }
  return { finding, plan: ratchetPlan({ metric, symbol, reportedNode, messageIdentity }) };
}

function hintedMessage({ ruleId, messageText, relativePath, comment, locatedNode, sourceFile }) {
  return eslintMessageWithHint({
    ruleId,
    text: messageText,
    relativePath,
    node: comment === undefined ? locatedNode : undefined,
    sourceFile,
  });
}

function reportedPositions(message, context, sourceFile) {
  const line = positiveInteger(message.line, `${context}.line`);
  const column = positiveInteger(message.column, `${context}.column`);
  const sourcePosition = sourceFile.getPositionOfLineAndCharacter(line - 1, column - 1);
  const endPosition =
    message.endLine === undefined || message.endColumn === undefined
      ? undefined
      : sourceFile.getPositionOfLineAndCharacter(
          positiveInteger(message.endLine, `${context}.endLine`) - 1,
          positiveInteger(message.endColumn, `${context}.endColumn`) - 1,
        );
  return { line, column, sourcePosition, endPosition };
}

function messageIdentityOf(message, messageText) {
  return typeof message.messageId === 'string' && message.messageId.length > 0
    ? message.messageId
    : normalizeMessageText(messageText);
}

function ratchetPlan({ metric, symbol, reportedNode, messageIdentity }) {
  if (metric !== undefined) {
    return { kind: 'metric', ...metric };
  }
  return symbol !== undefined && isInsideFunction(reportedNode)
    ? { kind: 'count', key: messageIdentity }
    : undefined;
}

function isInsideFunction(node) {
  return nodeChain(node).some(
    (current) => ts.isFunctionLike(current) && current.body !== undefined,
  );
}

function commentAt(text, position, endPosition) {
  const isLine = text.startsWith('//', position);
  if (!isLine && !text.startsWith('/*', position)) {
    return undefined;
  }
  if (endPosition !== undefined && endPosition > position) {
    return text.slice(position, endPosition);
  }
  if (isLine) {
    const lineEnd = text.indexOf('\n', position);
    return text.slice(position, lineEnd === -1 ? text.length : lineEnd);
  }
  const close = text.indexOf('*/', position + 2);
  return text.slice(position, close === -1 ? text.length : close + 2);
}

function commentFingerprint(comment) {
  return createHash('sha256').update(normalizeMessageText(comment)).digest('hex').slice(0, 24);
}

function findStartedNode(sourceFile, position) {
  let deepest = sourceFile;
  function visit(node) {
    if (node.getStart(sourceFile) <= position && position < node.end) {
      deepest = node;
      ts.forEachChild(node, visit);
    }
  }
  ts.forEachChild(sourceFile, visit);
  return deepest;
}

function findReportedNode(sourceFile, position, endPosition) {
  const containingNodes = [];
  function visit(node) {
    if (node.pos <= position && position < node.end) {
      containingNodes.push(node);
      ts.forEachChild(node, visit);
    }
  }
  visit(sourceFile);

  if (endPosition !== undefined) {
    const exactNode = containingNodes
      .slice()
      .reverse()
      .find((node) => node.getStart(sourceFile) === position && node.end === endPosition);
    if (exactNode !== undefined) {
      return exactNode;
    }
  }
  return containingNodes.at(-1) ?? sourceFile;
}

function eslintNodeType(node) {
  if (ts.isSourceFile(node)) {
    return 'Program';
  }
  if (ts.isVariableDeclaration(node)) {
    return 'VariableDeclarator';
  }
  if (ts.isPropertyDeclaration(node)) {
    return 'PropertyDefinition';
  }
  if (ts.isClassStaticBlockDeclaration(node)) {
    return 'StaticBlock';
  }
  return ts.SyntaxKind[node.kind];
}

function stableSyntaxAnchor(node) {
  if (
    node.kind === ts.SyntaxKind.EqualsGreaterThanToken &&
    node.parent !== undefined &&
    ts.isArrowFunction(node.parent)
  ) {
    return node.parent;
  }
  return node;
}

function nodeChain(node) {
  return node === undefined ? [] : [node, ...nodeChain(node.parent)];
}

function enclosingSymbol(node) {
  const names = [];
  for (const current of nodeChain(node)) {
    const name = declarationName(current);
    if (name !== undefined && names.at(-1) !== name) {
      names.push(name);
    }
  }
  return names.length === 0 ? undefined : names.reverse().join('.');
}

function declarationName(node) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isVariableDeclaration(node)
  ) {
    return node.name?.getText();
  }
  if (ts.isConstructorDeclaration(node)) {
    return 'constructor';
  }
  return undefined;
}

function fingerprintText(node) {
  if (ts.isFunctionLike(node) && node.body !== undefined) {
    return node.getSourceFile().text.slice(node.getStart(), node.body.getStart());
  }
  return node.getText();
}

function syntaxFingerprint(node, nodeType) {
  if (nodeType === 'Program') {
    return 'program';
  }

  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    fingerprintText(node),
  );
  const tokens = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    tokens.push({ kind: token, text: scanner.getTokenText() });
  }
  const semanticTokens = tokens
    .filter(
      (token, index) =>
        token.kind !== ts.SyntaxKind.CommaToken || !isClosingToken(tokens[index + 1]?.kind),
    )
    .map((token) => `${String(token.kind)}:${token.text}`);
  return createHash('sha256').update(semanticTokens.join('\0')).digest('hex').slice(0, 24);
}

function isClosingToken(kind) {
  return (
    kind === ts.SyntaxKind.CloseBraceToken ||
    kind === ts.SyntaxKind.CloseBracketToken ||
    kind === ts.SyntaxKind.CloseParenToken
  );
}

function assignSemanticOccurrences(findings) {
  const occurrences = new Map();
  return findings.map((finding) => {
    const semanticKey = JSON.stringify([
      finding.tool,
      finding.rule,
      finding.path,
      finding.symbol ?? '',
      finding.identity,
    ]);
    const occurrence = (occurrences.get(semanticKey) ?? 0) + 1;
    occurrences.set(semanticKey, occurrence);
    return {
      ...finding,
      identity: `${finding.identity}|occurrence:${String(occurrence)}`,
    };
  });
}

function linkDependencies({ dependencyRoot, roots }) {
  const linkedDependencies = [];
  try {
    for (const root of new Set(roots)) {
      const linkPath = path.join(root, 'node_modules');
      const existingEntry = lstatIfExists(linkPath);
      if (existingEntry !== undefined) {
        const isPreparedDirectory = existingEntry.isDirectory() && !existingEntry.isSymbolicLink();
        const isExpectedLink =
          existingEntry.isSymbolicLink() && realpathSync(linkPath) === dependencyRoot;
        if (!isPreparedDirectory && !isExpectedLink) {
          throw new Error(`Refusing to replace existing dependencies at ${linkPath}`);
        }
        continue;
      }
      symlinkSync(dependencyRoot, linkPath, 'dir');
      linkedDependencies.push({ linkPath, dependencyRoot });
    }
    return linkedDependencies;
  } catch (error) {
    removeDependencyLinks(linkedDependencies);
    throw error;
  }
}

function removeDependencyLinks(linkedDependencies) {
  for (const linkedDependency of linkedDependencies.reverse()) {
    removeOwnedLink(linkedDependency.linkPath, linkedDependency.dependencyRoot, 'dependency');
  }
}

function installPolicyFiles({ policyFiles, policyRoot, projectRoot }) {
  const installedFiles = [];
  const layout = readLayout();
  try {
    for (const [index, relativePath] of policyFiles.entries()) {
      const sourcePath = validatedContainedFile(
        policyRoot,
        relativePath,
        '--policy-file',
      ).canonicalPath;
      const extension = path.extname(relativePath);
      installedFiles.push(
        linkPolicyFile(
          sourcePath,
          path.join(projectRoot, `.nitpicker-diff-policy-${String(index)}${extension}`),
          layoutTransformFor(relativePath, layout),
        ),
      );
    }
    return installedFiles;
  } catch (error) {
    restorePolicyFiles(installedFiles);
    throw error;
  }
}

function restorePolicyFiles(installedFiles) {
  for (const installedFile of installedFiles.reverse()) {
    installedFile.remove();
  }
}

function nonRuleDiagnosticId(message, context) {
  if (message.startsWith('Unused eslint-disable directive')) {
    return 'eslint/unused-disable-directive';
  }
  if (message.includes("has no effect because you have 'noInlineConfig' setting")) {
    return 'eslint/inline-config-disabled';
  }
  throw new Error(`${context} has no rule identifier: ${message}`);
}

function validatedProjectFile(projectRoot, filePath) {
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(projectRoot, resolvedPath).replaceAll('\\', '/');
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith('../') ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`ESLint returned a path outside the analyzed snapshot: ${filePath}`);
  }
  const entry = lstatIfExists(resolvedPath);
  if (entry === undefined || !entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`ESLint returned a non-regular source file: ${filePath}`);
  }
  const canonicalPath = realpathSync(resolvedPath);
  assertContainedPath(projectRoot, canonicalPath, 'ESLint source');
  return { relativePath, canonicalPath };
}

function normalizeMessageText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizedRelativePath(value, context) {
  const normalizedPath = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (
    normalizedPath.length === 0 ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    path.posix.isAbsolute(normalizedPath) ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new Error(`${context} must stay within the project root`);
  }
  return normalizedPath;
}

function validatedContainedFile(root, relativePath, context) {
  const normalizedPath = normalizedRelativePath(relativePath, context);
  const resolvedPath = path.resolve(root, normalizedPath);
  assertContainedPath(root, resolvedPath, context);
  const entry = lstatIfExists(resolvedPath);
  if (entry === undefined || !entry.isFile() || entry.isSymbolicLink()) {
    throw new Error(`${context} must resolve to a regular file within its root`);
  }
  const canonicalPath = realpathSync(resolvedPath);
  assertContainedPath(root, canonicalPath, context);
  return { normalizedPath, canonicalPath };
}

function assertContainedPath(root, candidate, context) {
  const relativePath = path.relative(root, candidate);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`${context} must stay within ${root}`);
  }
}

function scriptKind(filePath) {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function requiredValue(name, value) {
  if (value === undefined) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function environmentEntry(value) {
  const separator = value.indexOf('=');
  if (separator < 1) {
    throw new Error('--environment requires NAME=value');
  }
  return [value.slice(0, separator), value.slice(separator + 1)];
}

function recordArgument({ values, patterns }, name, value) {
  if (name === '--pattern') {
    patterns.push(requiredValue(name, value));
    return;
  }
  if (name === '--policy-file') {
    values.set(`policy-file:${String(values.size)}`, requiredValue(name, value));
    return;
  }
  if (!VALUE_ARGUMENTS.has(name)) {
    throw new Error(`Unknown ESLint adapter argument: ${name}`);
  }
  requiredValue(name, value);
  if (name !== '--environment') {
    values.set(name, value);
    return;
  }
  const [variable, variableValue] = environmentEntry(value);
  values.set(`environment:${variable}`, variableValue);
}

function collectArguments(arguments_) {
  const collected = { values: new Map(), patterns: [] };
  const remaining = arguments_.values();
  for (const name of remaining) {
    recordArgument(collected, name, remaining.next().value);
  }
  return collected;
}

function prefixedValues(values, prefix) {
  return [...values]
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, value]) => [name.slice(prefix.length), value]);
}

function parseArguments(arguments_) {
  const { values, patterns } = collectArguments(arguments_);
  if (patterns.length === 0) {
    throw new Error('ESLint adapter requires at least one --pattern');
  }
  const environment = Object.fromEntries(prefixedValues(values, 'environment:'));
  const policyFiles = prefixedValues(values, 'policy-file:').map(([, value]) => value);
  return {
    analyzerName: requiredArgument(values, '--analyzer-name'),
    projectRoot: validatedSnapshotRoot(
      requiredArgument(values, '--project-root'),
      '--project-root',
    ),
    policyRoot: validatedPolicyRoot(requiredArgument(values, '--policy-root')),
    liveProjectRoot:
      values.get('--live-project-root') === undefined
        ? PACKAGE_ROOT
        : realpathSync(values.get('--live-project-root')),
    toolRoot: validatedToolRoot(requiredArgument(values, '--tool-root')),
    configRelativePath: normalizedRelativePath(requiredArgument(values, '--config'), '--config'),
    timeoutMs: positiveInteger(
      Number(values.get('--timeout-ms') ?? DEFAULT_ESLINT_TIMEOUT_MS),
      '--timeout-ms',
    ),
    eslintCliPath:
      values.get('--eslint-cli') === undefined
        ? undefined
        : validatedEslintCli(values.get('--eslint-cli')),
    environment,
    patterns: patterns.map(validatePattern),
    policyFiles: policyFiles.map((value) => normalizedRelativePath(value, '--policy-file')),
  };
}

function validatedSnapshotRoot(value, context) {
  const canonicalRoot = realpathSync(path.resolve(value));
  if (!statSync(canonicalRoot).isDirectory()) {
    throw new Error(`${context} must be a directory`);
  }

  const relativeToTemporaryRoot = path.relative(realpathSync(tmpdir()), canonicalRoot);
  const segments = relativeToTemporaryRoot.split(path.sep);
  if (
    relativeToTemporaryRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToTemporaryRoot) ||
    segments.length < 2 ||
    !segments[0].startsWith('nitpicker-diff-') ||
    !SNAPSHOT_DIRECTORY_NAMES.includes(segments[1])
  ) {
    throw new Error(`${context} must be inside a generated quality-diff worktree`);
  }
  return canonicalRoot;
}

function validatedPolicyRoot(value) {
  const root = realpathSync(path.resolve(value));
  return root === PACKAGE_ROOT ? root : validatedSnapshotRoot(value, '--policy-root');
}

function validatedToolRoot(value) {
  const canonicalRoot = realpathSync(path.resolve(value));
  if (canonicalRoot !== TRUSTED_TOOL_ROOT) {
    throw new Error('--tool-root must be the project checkout containing this adapter');
  }
  return canonicalRoot;
}

function validatedEslintCli(value) {
  const canonicalPath = realpathSync(path.resolve(value));
  assertContainedPath(TRUSTED_TOOL_ROOT, canonicalPath, '--eslint-cli');
  if (!statSync(canonicalPath).isFile()) {
    throw new Error('--eslint-cli must be a regular file');
  }
  return canonicalPath;
}

function validatePattern(value) {
  const normalizedPattern = value.replaceAll('\\', '/');
  if (
    normalizedPattern.length === 0 ||
    path.posix.isAbsolute(normalizedPattern) ||
    /^[A-Za-z]:\//.test(normalizedPattern) ||
    normalizedPattern.split('/').includes('..')
  ) {
    throw new Error('--pattern must stay within the analyzed snapshot');
  }
  return normalizedPattern;
}

function requiredArgument(values, name) {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredString(value, context) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}

function positiveInteger(value, context) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${context} must be a positive integer`);
  }
  return value;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
