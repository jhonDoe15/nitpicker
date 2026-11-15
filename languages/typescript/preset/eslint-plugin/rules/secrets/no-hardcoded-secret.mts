import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  hasCredentialShape,
  isHardcodedSecret,
  isSecretName,
} from '../../../../../../shared/naming/secret-words.mjs';
import { envKey, literalParts, type LiteralPart, memberName, stringKey } from './secret-nodes.mts';

type MessageIds = 'hardcodedSecret' | 'credentialLiteral';
type Context = Readonly<TSESLint.RuleContext<MessageIds, readonly []>>;

const FALLBACKS = new Set(['||', '??']);
const ASSIGNMENTS = new Set(['=', '||=', '??=']);

function propertyKey(node: TSESTree.Property | TSESTree.PropertyDefinition): string | undefined {
  if (node.computed) {
    return stringKey(node.key);
  }
  return node.key.type === AST_NODE_TYPES.Identifier ? node.key.name : stringKey(node.key);
}

function bindingName(target: TSESTree.Node): string | undefined {
  if (target.type === AST_NODE_TYPES.Identifier) {
    return target.name;
  }
  return target.type === AST_NODE_TYPES.MemberExpression ? memberName(target) : undefined;
}

type SecretChecks = {
  readonly checkValue: (name: string | undefined, value: TSESTree.Node | undefined) => void;
  readonly checkCredential: (node: TSESTree.Node, text: string) => void;
};

function secretParts(name: string | undefined, value: TSESTree.Node | undefined): LiteralPart[] {
  if (name === undefined || value === undefined || !isSecretName(name)) {
    return [];
  }
  return literalParts(value).filter((part) => isHardcodedSecret(part.text, name));
}

function secretChecks(context: Context): SecretChecks {
  const reported = new Set<TSESTree.Node>();

  function report(
    node: TSESTree.Node,
    messageId: MessageIds,
    data: Readonly<Record<string, string>> = {},
  ): void {
    if (!reported.has(node)) {
      reported.add(node);
      context.report({ node, messageId, data });
    }
  }

  return {
    checkValue(name, value) {
      if (name === undefined) {
        return;
      }
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

export const rule: TSESLint.RuleModule<MessageIds> = {
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
        checks.checkValue(bindingName(node.id), node.init ?? undefined);
      },
      AssignmentPattern(node) {
        checks.checkValue(bindingName(node.left), node.right);
      },
      PropertyDefinition(node) {
        checks.checkValue(propertyKey(node), node.value ?? undefined);
      },
      Property(node) {
        if (node.parent.type === AST_NODE_TYPES.ObjectExpression) {
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
