import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { readStamped } from '../../../modules/stamped-file-cache.mjs';
import { scriptKindOf } from '../../../modules/module-sources.mjs';
import { readLayout } from '../../../head-policy.mjs';
import { reachableNames } from '../../../../../../shared/rules/round-trips/round-trips.mjs';

const TEST_CALLS = new Set(['it', 'test', 'specify']);
const files = new Map();

function calleeOf(node) {
  if (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)) {
    return node.expression;
  }
  return ts.isTaggedTemplateExpression(node) ? node.tag : undefined;
}

function rootName(expression) {
  const chain = [expression];
  for (const current of chain) {
    const inner = calleeOf(current);
    if (inner !== undefined) {
      chain.push(inner);
    }
  }
  const root = chain.at(-1);
  return ts.isIdentifier(root) ? root.text : undefined;
}

function namesIn(nodes) {
  const names = new Set();
  function visit(child) {
    if (ts.isIdentifier(child)) {
      names.add(child.text);
    }
    ts.forEachChild(child, visit);
  }
  for (const node of nodes) {
    visit(node);
  }
  return names;
}

function isFunction(node) {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function helperOf(node) {
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    return [[node.name.text, namesIn([node])]];
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    isFunction(node.initializer)
  ) {
    return [[node.name.text, namesIn([node.initializer])]];
  }
  return [];
}

function isTestCall(node) {
  return ts.isCallExpression(node) && TEST_CALLS.has(rootName(node.expression));
}

function scanned(file) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file));
  const tests = [];
  const helpers = [];
  function visit(node) {
    if (isTestCall(node)) {
      tests.push(namesIn(node.arguments.slice(1)));
    }
    helpers.push(...helperOf(node));
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { tests, helpers };
}

function helperTable(found) {
  const table = new Map();
  for (const [name, names] of found.flatMap(({ helpers }) => helpers)) {
    table.set(name, new Set([...(table.get(name) ?? []), ...names]));
  }
  return table;
}

export function testedNames(projectRoot) {
  const layout = readLayout();
  const found = layout
    .projectCodeFiles(projectRoot)
    .filter((file) => layout.isTestFile(file))
    .map((file) => readStamped(files, path.join(projectRoot, file), scanned))
    .filter(Boolean);
  const helpers = helperTable(found);
  return found.flatMap(({ tests }) => tests.map((names) => reachableNames(names, helpers)));
}
