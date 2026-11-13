import {
  hasCredentialShape,
  isHardcodedSecret,
  isSecretName,
} from '../../../../../../shared/naming/secret-words.mjs';
import { envKey, literalParts, memberName, stringKey } from './secret-nodes.mjs';

const FALLBACKS = new Set(['||', '??']);
const ASSIGNMENTS = new Set(['=', '||=', '??=']);

function propertyKey(node) {
  if (node.computed) {
    return stringKey(node.key);
  }
  return node.key.type === 'Identifier' ? node.key.name : stringKey(node.key);
}

function bindingName(target) {
  if (target.type === 'Identifier') {
    return target.name;
  }
  return target.type === 'MemberExpression' ? memberName(target) : undefined;
}

function secretParts(name, value) {
  const named = name !== undefined && value !== null && value !== undefined && isSecretName(name);
  return named ? literalParts(value).filter((part) => isHardcodedSecret(part.text, name)) : [];
}

function secretChecks(context) {
  const reported = new Set();

  function report(node, messageId, data = {}) {
    if (!reported.has(node)) {
      reported.add(node);
      context.report({ node, messageId, data });
    }
  }

  return {
    checkValue(name, value) {
      for (const part of secretParts(name, value)) {
        report(part.node, 'hardcodedSecret', { name: `\`${name}\`` });
      }
    },
    checkCredential(node, text) {
      if (hasCredentialShape(text)) {
        report(node, 'credentialLiteral');
      }
    },
  };
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow secrets written into the source' },
    schema: [],
    messages: {
      hardcodedSecret:
        'Read {{ name }} from the environment or a secrets manager and inject it: this value is a hardcoded secret.',
      credentialLiteral:
        'Read it from the environment or a secrets manager: this string looks like a credential (access key, token, private key, or a password in a URL).',
    },
  },
  create(context) {
    const checks = secretChecks(context);

    return {
      VariableDeclarator(node) {
        checks.checkValue(bindingName(node.id), node.init);
      },
      AssignmentPattern(node) {
        checks.checkValue(bindingName(node.left), node.right);
      },
      PropertyDefinition(node) {
        checks.checkValue(propertyKey(node), node.value);
      },
      Property(node) {
        if (node.parent.type === 'ObjectExpression') {
          checks.checkValue(propertyKey(node), node.value);
        }
      },
      AssignmentExpression(node) {
        if (ASSIGNMENTS.has(node.operator)) {
          checks.checkValue(bindingName(node.left), node.right);
        }
      },
      LogicalExpression(node) {
        if (FALLBACKS.has(node.operator)) {
          checks.checkValue(envKey(node.left), node.right);
        }
      },
      Literal(node) {
        if (typeof node.value === 'string') {
          checks.checkCredential(node, node.value);
        }
      },
      TemplateElement(node) {
        checks.checkCredential(node, node.value.cooked ?? '');
      },
    };
  },
};
