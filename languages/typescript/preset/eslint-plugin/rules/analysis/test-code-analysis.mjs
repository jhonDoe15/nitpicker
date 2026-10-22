import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { chainOf } from './ancestry.mjs';
import {
  isFunctionNode,
  resolveConstant,
  resolveFunction,
  stringValue,
} from './constant-resolution.mjs';
import { describeSubprocess, literalTokens } from './subprocess-calls.mjs';

export { findVariable, resolveConstant, constantNumber } from './constant-resolution.mjs';
export {
  moduleBindings,
  importedCalleeName,
  subprocessBindings,
  describeSubprocess,
  gitSubcommand,
} from './subprocess-calls.mjs';

export function memberName(node) {
  if (node.type !== 'MemberExpression') return undefined;
  const { property } = node;
  if (!node.computed) return property.type === 'Identifier' ? property.name : undefined;
  return property.type === 'Literal' && typeof property.value === 'string'
    ? property.value
    : undefined;
}

const mockRunnerNames = new Set(['vi', 'jest']);
const moduleMockMethods = new Set(['mock', 'doMock']);

export function mockedModuleSource(node, runners = mockRunnerNames) {
  const callee = node?.type === 'CallExpression' ? node.callee : undefined;
  const isMock =
    callee?.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    runners.has(callee.object.name) &&
    moduleMockMethods.has(memberName(callee));
  const [argument] = isMock ? node.arguments : [];
  const source = argument?.type === 'ImportExpression' ? argument.source : argument;
  return source?.type === 'Literal' && typeof source.value === 'string' ? source.value : undefined;
}

const browserTestModule = /^(?:@playwright\/|cypress(?:\/|$))/u;

export function isBrowserEndToEndTest({ sources, projectFile, layout }) {
  return (
    sources.some((source) => browserTestModule.test(source)) || layout.isEndToEndTest(projectFile)
  );
}

export function propertyKeyName(property) {
  const { key } = property;
  if (key.type === 'Identifier' && !property.computed) return key.name;
  return key.type === 'Literal' ? String(key.value) : undefined;
}

export function isExpectCall(node) {
  if (node?.type !== 'CallExpression') return false;
  const { callee } = node;
  if (callee.type === 'Identifier') return callee.name === 'expect';
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'expect'
  );
}

const PER_TEST_TESTS = new Set(['it', 'test']);
const REGISTRATION_FACTORIES = new Set(['each', 'for', 'extend', 'runIf', 'skipIf', 'todo']);

function parameterNames(fn) {
  return fn.params.flatMap((parameter) => {
    if (parameter.type === 'Identifier') return [parameter.name];
    if (parameter.type === 'RestElement' && parameter.argument.type === 'Identifier') {
      return [parameter.argument.name];
    }
    if (parameter.type === 'AssignmentPattern' && parameter.left.type === 'Identifier') {
      return [parameter.left.name];
    }
    return [];
  });
}

function referencesAny(node, names) {
  for (const candidate of depthFirst(node, objectChildren)) {
    if (candidate?.type === 'Identifier' && names.has(candidate.name)) return true;
  }
  return false;
}

function childNodes(context, node) {
  return (context.sourceCode.visitorKeys[node.type] ?? []).flatMap((key) => {
    const value = node[key];
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  });
}

function forEachNode(context, root, visit) {
  const pending = [root];
  for (const node of pending) {
    visit(node);
    pending.push(...childNodes(context, node));
  }
}

export function describeWrapperCall(context, call, bindings) {
  if (call.type !== 'CallExpression') return undefined;
  const fn = resolveFunction(context, call.callee);
  if (!fn) return undefined;
  const parameters = parameterNames(fn);
  const names = new Set(parameters);
  const found = [];
  forEachNode(context, fn.body, (node) => {
    if (found.length > 0 || node.type !== 'CallExpression') return;
    const inner = describeSubprocess(context, node, bindings);
    if (!inner) return;
    const commandIndex =
      inner.commandNode?.type === 'Identifier' ? parameters.indexOf(inner.commandNode.name) : -1;
    if (commandIndex >= 0) {
      const command = stringValue(resolveConstant(context, call.arguments[commandIndex]));
      const tokens = call.arguments
        .filter((_argument, index) => index !== commandIndex)
        .flatMap((argument) => literalTokens(context, argument));
      found.push({ inner, node, command, tokens });
      return;
    }
    if (inner.command !== undefined && referencesAny(inner.argsNode, names)) {
      const tokens = [
        ...inner.tokens,
        ...call.arguments.flatMap((argument) => literalTokens(context, argument)),
      ];
      found.push({ inner, node, command: inner.command, tokens });
    }
  });
  return found[0];
}

function registrationRoot(callee) {
  const root = chainOf(callee, (link) => {
    if (link.type === 'MemberExpression') return link.object;
    return link.type === 'CallExpression' ? link.callee : undefined;
  }).at(-1);
  return root?.type === 'Identifier' ? root.name : undefined;
}

function perTestCallback(call, hooks = ['beforeEach']) {
  const root = registrationRoot(call.callee);
  if (root === undefined || !(PER_TEST_TESTS.has(root) || hooks.includes(root))) return undefined;
  if (
    call.callee.type === 'MemberExpression' &&
    !call.callee.computed &&
    REGISTRATION_FACTORIES.has(call.callee.property.name)
  ) {
    return undefined;
  }
  return [...call.arguments].reverse().find(isFunctionNode);
}

export function perTestVisitors(context, check, hooks) {
  const reported = new Set();
  return {
    CallExpression(registration) {
      const callback = perTestCallback(registration, hooks);
      if (!callback) return;
      const visited = new Set([callback]);
      const pending = [callback.body];
      for (const body of pending) {
        forEachNode(context, body, (node) => {
          if (node.type !== 'CallExpression' && node.type !== 'NewExpression') return;
          if (!reported.has(node)) {
            const report = check(node);
            if (report) {
              reported.add(node);
              context.report({ node, ...report });
            }
          }
          const fn =
            node.type === 'CallExpression' ? resolveFunction(context, node.callee) : undefined;
          if (fn && !visited.has(fn)) {
            visited.add(fn);
            pending.push(fn.body);
          }
        });
      }
    },
  };
}
