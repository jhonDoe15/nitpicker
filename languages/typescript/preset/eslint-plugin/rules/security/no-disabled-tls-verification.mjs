import { isFunctionNode, stringValue } from '../analysis/constant-resolution.mjs';
import { leafValues, memberName, staticKey, unwrapped } from './security-values.mjs';

const ENV_NAME = 'NODE_TLS_REJECT_UNAUTHORIZED';
const FALSE_DISABLES = new Set([
  'rejectUnauthorized',
  'strictSSL',
  'strictSsl',
  'checkServerIdentity',
]);
const TRUE_DISABLES = new Set([
  'ignoreHTTPSErrors',
  'ignoreHttpsErrors',
  'acceptInsecureCerts',
  'allowInsecureCerts',
]);
const INSECURE_TEXT =
  /NODE_TLS_REJECT_UNAUTHORIZED=0|sslmode=no-verify|--ignore-certificate-errors/u;

function isLiteral(node, value) {
  return node?.type === 'Literal' && node.value === value;
}

function isOffValue(leaf) {
  return isLiteral(leaf, 0) || stringValue(leaf) === '0';
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
    return leaves.some((leaf) => isLiteral(leaf, true));
  }
  return FALSE_DISABLES.has(name) && leaves.some((leaf) => isLiteral(leaf, false));
}

function targetName(left) {
  const target = unwrapped(left);
  if (target.type === 'MemberExpression') {
    return memberName(target);
  }
  return target.type === 'Identifier' ? target.name : undefined;
}

function textParts(node) {
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '');
  }
  return typeof node.value === 'string' ? [node.value] : [];
}

function hasInsecureText(node) {
  return textParts(node).some((text) => INSECURE_TEXT.test(text));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow turning off TLS certificate verification' },
    schema: [],
    messages: {
      tlsVerificationOff:
        'Turning off TLS certificate verification lets anyone on the network pose as the server. Keep verification on and trust the certificate authority instead: `new https.Agent({ ca: readFileSync(caPath) })`, or set NODE_EXTRA_CA_CERTS for a private CA. If a contained case cannot do that, add an exception for this rule in nitpicker.config.json.',
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
        checkNamed(node, staticKey(node), node.value);
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
