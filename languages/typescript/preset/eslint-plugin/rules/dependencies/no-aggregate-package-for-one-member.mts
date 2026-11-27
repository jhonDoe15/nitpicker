import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { textOf } from '../../../../../../shared/values/readers.mts';
import { nameOf } from '../typed/node-views.mts';
import { outermostOf } from '../typed/syntax-views.mts';

type Members = ReadonlySet<string> | undefined;

const MEMBER_PACKAGES: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([
  [
    'typescript-eslint',
    new Map([
      ['parser', '@typescript-eslint/parser'],
      ['plugin', '@typescript-eslint/eslint-plugin'],
    ]),
  ],
]);
const WRAPPERS = [AST_NODE_TYPES.AwaitExpression, AST_NODE_TYPES.TSAsExpression];

function isRequire(context: SourceContext, callee: TSESTree.Node): boolean {
  if (nameOf(callee) === 'require') {
    return true;
  }
  const made =
    callee.type === AST_NODE_TYPES.CallExpression ? callee : resolveConstant(context, callee);
  return made?.type === AST_NODE_TYPES.CallExpression && nameOf(made.callee) === 'createRequire';
}

function memberOf(identifier: TSESTree.Node): string | undefined {
  const { parent } = identifier;
  const read =
    parent?.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === identifier &&
    !parent.computed &&
    !(parent.parent.type === AST_NODE_TYPES.AssignmentExpression && parent.parent.left === parent);
  return read ? nameOf(parent.property) : undefined;
}

function bindingMembers(context: SourceContext, id: TSESTree.Identifier): Members {
  const references = [findVariable(context, id, id.name)]
    .filter((variable) => variable !== undefined)
    .flatMap((variable) => variable.references)
    .filter((reference) => reference.identifier !== id);
  const names = references.map((reference) => memberOf(reference.identifier));
  return names.every((name) => name !== undefined) ? new Set(names) : undefined;
}

function patternMembers(pattern: TSESTree.ObjectPattern): Members {
  const names = pattern.properties.map((property) =>
    property.type === AST_NODE_TYPES.Property && !property.computed
      ? nameOf(property.key)
      : undefined,
  );
  return names.every((name) => name !== undefined) ? new Set(names) : undefined;
}

function loadedMembers(context: SourceContext, load: TSESTree.Node): Members {
  const outer = outermostOf(load, WRAPPERS);
  const member = memberOf(outer);
  if (member !== undefined) {
    return new Set([member]);
  }
  const { parent } = outer;
  if (parent?.type !== AST_NODE_TYPES.VariableDeclarator) {
    return undefined;
  }
  if (parent.id.type === AST_NODE_TYPES.ObjectPattern) {
    return patternMembers(parent.id);
  }
  return parent.id.type === AST_NODE_TYPES.Identifier
    ? bindingMembers(context, parent.id)
    : undefined;
}

function importMembers(context: SourceContext, node: TSESTree.ImportDeclaration): Members {
  const values = node.specifiers.filter(
    (specifier) =>
      specifier.type !== AST_NODE_TYPES.ImportSpecifier || specifier.importKind !== 'type',
  );
  const sets = values.map((specifier) =>
    specifier.type === AST_NODE_TYPES.ImportSpecifier
      ? new Set([textOf(nameOf(specifier.imported))])
      : bindingMembers(context, specifier.local),
  );
  return sets.every((set) => set !== undefined)
    ? new Set(sets.flatMap((set) => [...set]))
    : undefined;
}

function report(
  context: Readonly<TSESLint.RuleContext<'wholePackage', []>>,
  node: TSESTree.Node,
  name: string | undefined,
  members: () => Members,
): void {
  const table = MEMBER_PACKAGES.get(textOf(name));
  if (table === undefined || name === undefined) {
    return;
  }
  const found = members();
  const candidates = found?.size === 1 ? [...found] : [];
  for (const member of candidates) {
    const replacement = table.get(member);
    if (replacement !== undefined) {
      context.report({ node, messageId: 'wholePackage', data: { name, member, replacement } });
    }
  }
}

export const rule: TSESLint.RuleModule<'wholePackage'> = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow loading a whole tool package to use one member that ships as its own package',
    },
    schema: [],
    messages: {
      wholePackage:
        "This loads '{{name}}', which loads every part of the tool, to use only its '{{member}}'. Load '{{replacement}}' instead (resolved from the location of '{{name}}' when it is not a direct dependency); loading the whole package costs about half a CPU second more each time.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isRequire(context, node.callee) && node.arguments.length === 1) {
          report(context, node, stringValue(node.arguments[0]), () => loadedMembers(context, node));
        }
      },
      ImportExpression(node) {
        report(context, node, stringValue(node.source), () => loadedMembers(context, node));
      },
      ImportDeclaration(node) {
        const name = node.importKind === 'type' ? undefined : node.source.value;
        report(context, node, name, () => importMembers(context, node));
      },
    };
  },
};
