import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { suggestible } from '../../../fixes/support/descriptors.mts';
import type { FixPlan } from '../../../fixes/support/ranges.mts';
import { tlsOptionFix } from '../../../fixes/security/tls-option-fix.mts';
import { isFunctionNode, stringValue } from '../../analysis/constant-resolution.mts';
import { isTestExpression } from '../../database/orm-options.mts';
import { nameOf } from '../../typed/node-views.mts';
import {
  isLiteral,
  leafValues,
  memberName,
  propertyNamed,
  staticKey,
  unwrapped,
  type Context,
} from '../security-values.mts';
import { hasInsecureText } from './tls-text.mts';

type MessageIds = 'tlsVerificationOff' | 'dropOption';

const ENV_NAME = 'NODE_TLS_REJECT_UNAUTHORIZED';
const FALSE_DISABLES = new Set([
  'rejectUnauthorized',
  'strictSSL',
  'strictSsl',
  'sslValidate',
  'checkServerIdentity',
]);
const TRUE_DISABLES = new Set([
  'ignoreHTTPSErrors',
  'ignoreHttpsErrors',
  'acceptInsecureCerts',
  'allowInsecureCerts',
  'tlsAllowInvalidCertificates',
  'tlsAllowInvalidHostnames',
  'tlsInsecure',
]);
const SERVER_FACTORIES = new Set<string | undefined>([
  'createServer',
  'createSecureServer',
  'Server',
]);
const CONDITION_OPERATORS = new Set(['===', '!==', '==', '!=']);

function isOffValue(leaf: TSESTree.Node): boolean {
  return isLiteral(leaf, 0) || stringValue(leaf) === '0';
}

function returnsNothing(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration,
): boolean {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    const body = unwrapped(fn.body);
    return (
      (body.type === AST_NODE_TYPES.Identifier && body.name === 'undefined') ||
      (body.type === AST_NODE_TYPES.Literal && body.raw === 'null')
    );
  }
  return fn.body.body.every(
    (statement) =>
      statement.type === AST_NODE_TYPES.ReturnStatement &&
      (statement.argument === null || nameOf(statement.argument) === 'undefined'),
  );
}

function disablesNamed(context: Context, name: string, value: TSESTree.Node): boolean {
  const leaves = leafValues(context, value);
  if (name === 'checkServerIdentity') {
    return leaves.some((leaf) => isFunctionNode(leaf) && returnsNothing(leaf));
  }
  if (name === ENV_NAME) {
    return leaves.some((leaf) => isOffValue(leaf));
  }
  if (TRUE_DISABLES.has(name)) {
    return leaves.some(
      (leaf) => isLiteral(leaf, true) || isTestExpression(leaf, CONDITION_OPERATORS),
    );
  }
  return (
    FALSE_DISABLES.has(name) &&
    leaves.some((leaf) => isLiteral(leaf, false) || isTestExpression(leaf, CONDITION_OPERATORS))
  );
}

function isServerOptions(context: Context, property: TSESTree.Property): boolean {
  const object = property.parent;
  const requestCert = propertyNamed(context, object, 'requestCert');
  if (
    requestCert !== undefined &&
    leafValues(context, requestCert).every((leaf) => isLiteral(leaf, true))
  ) {
    return true;
  }
  const call = object.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression && call.type !== AST_NODE_TYPES.NewExpression) {
    return false;
  }
  const callee = unwrapped(call.callee);
  const name =
    callee.type === AST_NODE_TYPES.MemberExpression ? memberName(callee) : nameOf(callee);
  return call.arguments.some((argument) => argument === object) && SERVER_FACTORIES.has(name);
}

function targetName(left: TSESTree.Node): string | undefined {
  const target = unwrapped(left);
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return memberName(target);
  }
  return target.type === AST_NODE_TYPES.Identifier ? target.name : undefined;
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: { description: 'Disallow turning off TLS certificate verification' },
    schema: [],
    messages: {
      tlsVerificationOff:
        'Turning off TLS certificate verification lets anyone on the network pose as the server, and turning it off by environment ships the switch to production. Keep verification on in every environment and trust the certificate authority instead: `new https.Agent({ ca: readFileSync(caPath) })`, `tlsCAFile` for MongoDB, or set NODE_EXTRA_CA_CERTS for a private CA; for browser automation against a local certificate pin it with `--ignore-certificate-errors-spki-list=<hash>`. A server that asks for optional client certificates sets `requestCert: true` and checks `socket.authorized`. An exception fits only when a contained case cannot do that.',
      dropOption: 'Remove the option that turns verification off, so the default (on) applies.',
    },
  },
  create(context) {
    function report(node: TSESTree.Node, plan?: FixPlan): void {
      context.report(
        suggestible({ node, messageId: 'tlsVerificationOff' }, { messageId: 'dropOption', plan }),
      );
    }

    function checkNamed(node: TSESTree.Node, name: string | undefined, value: TSESTree.Node): void {
      if (name !== undefined && disablesNamed(context, name, value)) {
        report(node, tlsOptionFix(context.sourceCode, node));
      }
    }

    return {
      Property(node) {
        const key = staticKey(node);
        const server = key === 'rejectUnauthorized' && isServerOptions(context, node);
        if (!server) {
          checkNamed(node, key, node.value);
        }
      },
      AssignmentExpression(node) {
        if (node.operator === '=') {
          checkNamed(node, targetName(node.left), node.right);
        }
      },
      Literal(node) {
        if (hasInsecureText(node)) {
          report(node);
        }
      },
      TemplateLiteral(node) {
        if (hasInsecureText(node)) {
          report(node);
        }
      },
    };
  },
};
