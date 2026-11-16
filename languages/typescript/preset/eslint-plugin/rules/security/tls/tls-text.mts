import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { callName, isTypeWrapper, memberName } from '../security-values.mts';

const ENV_TEXT = /NODE_TLS_REJECT_UNAUTHORIZED=0/u;
const ENV_ASSIGNMENT = /^\s*NODE_TLS_REJECT_UNAUTHORIZED=0\s*$/u;
const INSECURE_PARAMETERS = [
  'sslmode=no-verify',
  'tlsAllowInvalidCertificates=true',
  'tlsAllowInvalidHostnames=true',
  'tlsInsecure=true',
  'sslValidate=false',
];
const URL_TEXT = new RegExp(`[?&](?:${INSECURE_PARAMETERS.join('|')})(?:&|$|#)`, 'iu');
const FLAG_TEXT = /^(?:--)?ignore-certificate-errors(?:=\S*)?$/u;
const LAUNCHER =
  /^(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork|execa|execaSync|execaCommand|execaCommandSync|\$)$/u;
const LOOKUPS = new Set<string | undefined>([
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
const COLLECTIONS = new Set<string | undefined>(['Set', 'Map', 'WeakSet']);
const PASSTHROUGH = new Set<string>([
  AST_NODE_TYPES.ArrayExpression,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.SpreadElement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
]);

type TextNode = TSESTree.Literal | TSESTree.TemplateLiteral;
type Consumer = {
  readonly owner: TSESTree.Node | undefined;
  readonly holder: TSESTree.Node | undefined;
};

function textParts(node: TextNode): string[] {
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '');
  }
  return typeof node.value === 'string' ? [node.value] : [];
}

function wholeText(node: TextNode): string | undefined {
  return node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length > 0
    ? undefined
    : textParts(node).join('');
}

function consumer(node: TextNode): Consumer {
  const owners = ancestorsOf(node);
  const index = owners.findIndex(
    (owner) =>
      !(
        PASSTHROUGH.has(owner.type) ||
        isTypeWrapper(owner) ||
        (owner.type === AST_NODE_TYPES.BinaryExpression && owner.operator === '+')
      ),
  );
  const owner = owners[index];
  return { owner, holder: index === 0 ? node : owners[index - 1] };
}

function isLookup({ owner, holder }: Consumer): boolean {
  if (owner === undefined) {
    return false;
  }
  if (owner.type === AST_NODE_TYPES.BinaryExpression || owner.type === AST_NODE_TYPES.SwitchCase) {
    return true;
  }
  if (owner.type === AST_NODE_TYPES.MemberExpression) {
    return owner.object === holder && LOOKUPS.has(memberName(owner));
  }
  if (owner.type === AST_NODE_TYPES.NewExpression) {
    return COLLECTIONS.has(nameOf(owner.callee));
  }
  return (
    owner.type === AST_NODE_TYPES.CallExpression &&
    owner.callee !== holder &&
    LOOKUPS.has(callName(owner))
  );
}

function reachesLauncher({ owner }: Consumer): boolean {
  return owner?.type === AST_NODE_TYPES.CallExpression && LAUNCHER.test(callName(owner) ?? '');
}

export function hasInsecureText(node: TextNode): boolean {
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
