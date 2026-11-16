import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { cachedValue } from '../../../../../../shared/values/caching/cached-value.mts';
import { flagOf } from './flags.mts';
import { iterationsIn } from './iterations.mts';

const MIN_ITERATIONS = 5;
const MIN_SHARE = 0.8;
const TEST_PATH =
  /(?:^|\/)(?:test|tests|__tests__|__mocks__|test-support|e2e|fixtures|__fixtures__)\/|\.(?:test|spec)\.[^/]+$/u;
const fileIterations = new WeakMap();
const indexes = new WeakMap();

export function iterationsOf(sourceFile, checker) {
  return cachedValue(fileIterations, sourceFile, () => iterationsIn(sourceFile, checker));
}

function isProjectSource(file) {
  const name = file.fileName.replaceAll('\\', '/');
  return !(file.isDeclarationFile || name.includes('/node_modules/') || TEST_PATH.test(name));
}

function calleeName(call) {
  const { expression } = call;
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  return ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
}

function narrowedHelper(call, checker) {
  const type = checker.getTypeAtLocation(call);
  if (!checker.isArrayType(type)) {
    return undefined;
  }
  const [element] = checker.getTypeArguments(type);
  const flag = element === undefined ? undefined : flagOf(checker, element, call);
  const name = calleeName(call);
  return flag?.narrowed && name !== undefined ? { key: flag.key, name } : undefined;
}

function recordHelpers(sourceFile, checker, entries) {
  const pending = [sourceFile];
  for (const node of pending) {
    const helper = ts.isCallExpression(node) ? narrowedHelper(node, checker) : undefined;
    if (helper !== undefined) {
      const counts = entries.get(helper.key)?.helpers;
      counts?.set(helper.name, (counts.get(helper.name) ?? 0) + 1);
    }
    pending.push(...node.getChildren(sourceFile));
  }
}

function buildIndex(program) {
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles().filter(isProjectSource);
  const entries = new Map();
  for (const file of files) {
    for (const { flag, guarded } of iterationsOf(file, checker)) {
      const entry = entries.get(flag.key) ?? {
        name: flag.name,
        alias: undefined,
        total: 0,
        guarded: 0,
        helpers: new Map(),
      };
      entry.total += 1;
      entry.guarded += guarded ? 1 : 0;
      entry.alias ??= flag.narrowed ? flag.alias : undefined;
      entries.set(flag.key, entry);
    }
  }
  for (const file of files) {
    recordHelpers(file, checker, entries);
  }
  return entries;
}

export function followedFlag(program, key) {
  const entry = cachedValue(indexes, program, buildIndex).get(key);
  const follows =
    entry !== undefined &&
    entry.total >= MIN_ITERATIONS &&
    entry.guarded / entry.total >= MIN_SHARE;
  if (!follows) {
    return undefined;
  }
  const best = [...entry.helpers].reduce(
    (top, each) => (top === undefined || each[1] > top[1] ? each : top),
    undefined,
  );
  const helper = best?.[0];
  return {
    name: entry.name,
    alias: entry.alias,
    helper,
    share: Math.round((entry.guarded / entry.total) * 100),
  };
}
