import { ancestorsOf } from '../../analysis/ancestry.mjs';
import { memberName, TYPE_WRAPPERS, unwrapped } from '../security-values.mjs';

const ENV_TEXT = /NODE_TLS_REJECT_UNAUTHORIZED=0/u;
const ENV_ASSIGNMENT = /^\s*NODE_TLS_REJECT_UNAUTHORIZED=0\s*$/u;
const URL_TEXT =
  /[?&](?:sslmode=no-verify|tlsAllowInvalidCertificates=true|tlsAllowInvalidHostnames=true|tlsInsecure=true|sslValidate=false)(?:&|$|#)/iu;
const FLAG_TEXT = /^(?:--)?ignore-certificate-errors(?![-\w])(?:=\S*)?$/u;
const LAUNCHER =
  /^(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork|execa|execaSync|execaCommand|execaCommandSync|\$)$/u;
const LOOKUPS = new Set([
  'has',
  'includes',
  'indexOf',
  'startsWith',
  'endsWith',
  'delete',
  'filter',
  'some',
  'find',
]);
const COLLECTIONS = new Set(['Set', 'Map', 'WeakSet']);
const PASSTHROUGH = new Set([
  'ArrayExpression',
  'TemplateLiteral',
  'SpreadElement',
  'ConditionalExpression',
  'LogicalExpression',
  ...TYPE_WRAPPERS,
]);

function textParts(node) {
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '');
  }
  return typeof node.value === 'string' ? [node.value] : [];
}

function wholeText(node) {
  return node.type === 'TemplateLiteral' && node.expressions.length > 0
    ? undefined
    : textParts(node).join('');
}

function consumer(node) {
  const owners = ancestorsOf(node);
  const index = owners.findIndex(
    (owner) =>
      !PASSTHROUGH.has(owner.type) &&
      !(owner.type === 'BinaryExpression' && owner.operator === '+'),
  );
  const owner = owners[index];
  return { owner, holder: index === 0 ? node : owners[index - 1] };
}

function calleeName(call) {
  const callee = unwrapped(call.callee);
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' ? memberName(callee) : undefined;
}

function isLookup({ owner, holder }) {
  switch (owner?.type) {
    case 'BinaryExpression':
    case 'SwitchCase':
      return true;
    case 'MemberExpression':
      return owner.object === holder && LOOKUPS.has(memberName(owner));
    case 'NewExpression':
      return COLLECTIONS.has(owner.callee.name);
    case 'CallExpression':
      return owner.callee !== holder && LOOKUPS.has(calleeName(owner));
    default:
      return false;
  }
}

function reachesLauncher({ owner }) {
  return owner?.type === 'CallExpression' && LAUNCHER.test(calleeName(owner) ?? '');
}

export function hasInsecureText(node) {
  const parts = textParts(node);
  if (parts.some((text) => URL_TEXT.test(text))) {
    return true;
  }
  const whole = wholeText(node);
  const used = consumer(node);
  if (whole !== undefined && FLAG_TEXT.test(whole)) {
    return !isLookup(used);
  }
  const env = parts.some((text) => ENV_TEXT.test(text));
  return env && ((whole !== undefined && ENV_ASSIGNMENT.test(whole)) || reachesLauncher(used));
}
