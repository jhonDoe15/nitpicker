import { isFunctionNode, stringValue } from '../../analysis/constant-resolution.mjs';
import {
  leafValues,
  memberName,
  propertyNamed,
  staticKey,
  unwrapped,
} from '../security-values.mjs';
import { hasInsecureText } from './tls-text.mjs';

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
const SERVER_FACTORIES = new Set(['createServer', 'createSecureServer', 'Server']);
const CONDITION_OPERATORS = new Set(['===', '!==', '==', '!=']);

function isLiteral(node, value) {
  return node?.type === 'Literal' && node.value === value;
}

function isOffValue(leaf) {
  return isLiteral(leaf, 0) || stringValue(leaf) === '0';
}

function isEnvRead(node) {
  const target = unwrapped(node);
  const owner = target?.type === 'MemberExpression' ? unwrapped(target.object) : undefined;
  return (
    owner?.type === 'MemberExpression' &&
    memberName(owner) === 'env' &&
    owner.object.type === 'Identifier' &&
    owner.object.name === 'process'
  );
}

function isCondition(leaf) {
  const target = unwrapped(leaf);
  return (
    (target.type === 'BinaryExpression' && CONDITION_OPERATORS.has(target.operator)) ||
    (target.type === 'UnaryExpression' && target.operator === '!') ||
    isEnvRead(target)
  );
}

function returnsNothing(fn) {
  if (fn.body.type !== 'BlockStatement') {
    const body = unwrapped(fn.body);
    return (
      (body.type === 'Identifier' && body.name === 'undefined') ||
      (body.type === 'Literal' && body.raw === 'null')
    );
  }
  return fn.body.body.every(
    (statement) =>
      statement.type === 'ReturnStatement' &&
      (statement.argument === null ||
        statement.argument === undefined ||
        statement.argument.name === 'undefined'),
  );
}

function disablesNamed(context, name, value) {
  const leaves = leafValues(context, value);
  if (name === 'checkServerIdentity') {
    return leaves.some((leaf) => isFunctionNode(leaf) && returnsNothing(leaf));
  }
  if (name === ENV_NAME) {
    return leaves.some((leaf) => isOffValue(leaf));
  }
  if (TRUE_DISABLES.has(name)) {
    return leaves.some((leaf) => isLiteral(leaf, true) || isCondition(leaf));
  }
  return (
    FALSE_DISABLES.has(name) && leaves.some((leaf) => isLiteral(leaf, false) || isCondition(leaf))
  );
}

function isServerOptions(context, property) {
  const object = property.parent;
  const requestCert = propertyNamed(context, object, 'requestCert');
  if (
    requestCert !== undefined &&
    leafValues(context, requestCert).every((leaf) => isLiteral(leaf, true))
  ) {
    return true;
  }
  const call = object.parent;
  const callee =
    call?.type === 'CallExpression' || call?.type === 'NewExpression'
      ? unwrapped(call.callee)
      : undefined;
  const name = callee?.type === 'MemberExpression' ? memberName(callee) : callee?.name;
  return (call?.arguments ?? []).includes(object) && SERVER_FACTORIES.has(name);
}

function targetName(left) {
  const target = unwrapped(left);
  if (target.type === 'MemberExpression') {
    return memberName(target);
  }
  return target.type === 'Identifier' ? target.name : undefined;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow turning off TLS certificate verification' },
    schema: [],
    messages: {
      tlsVerificationOff:
        'Turning off TLS certificate verification lets anyone on the network pose as the server, and turning it off by environment ships the switch to production. Keep verification on in every environment and trust the certificate authority instead: `new https.Agent({ ca: readFileSync(caPath) })`, `tlsCAFile` for MongoDB, or set NODE_EXTRA_CA_CERTS for a private CA; for browser automation against a local certificate pin it with `--ignore-certificate-errors-spki-list=<hash>`. A server that asks for optional client certificates sets `requestCert: true` and checks `socket.authorized`. An exception fits only when a contained case cannot do that.',
    },
  },
  create(context) {
    function report(node) {
      context.report({ node, messageId: 'tlsVerificationOff' });
    }

    function checkNamed(node, name, value) {
      if (name !== undefined && disablesNamed(context, name, value)) {
        report(node);
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
