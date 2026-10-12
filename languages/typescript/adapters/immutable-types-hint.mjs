import ts from 'typescript';

const GENERIC_HINT = 'Type it deeply readonly, e.g. `readonly T[]` or `{ readonly field: T }`.';

const READONLY_WRAPPERS = new Set(['Readonly', 'ReadonlyArray', 'ReadonlySet', 'ReadonlyMap']);

const MUTABLE_CLASSES = new Set([
  'AbortController',
  'AbortSignal',
  'ArrayBuffer',
  'Buffer',
  'EventTarget',
  'Headers',
  'URL',
  'URLSearchParams',
  'Uint8Array',
  'WeakMap',
  'WeakSet',
]);

const ARRAY_PRODUCING_METHODS = new Set([
  'concat',
  'filter',
  'flat',
  'flatMap',
  'map',
  'slice',
  'split',
  'toReversed',
  'toSorted',
  'toSpliced',
  'with',
]);

const ARRAY_PRODUCING_STATICS = new Set([
  'Array.from',
  'Array.of',
  'Object.entries',
  'Object.keys',
  'Object.values',
]);

const KINDS = {
  array: { label: 'array', hint: 'Type it `readonly T[]`.' },
  set: {
    label: 'Set',
    hint: 'Type it `ReadonlySet<T>`, or build it inline: `[...new Set(xs)]`.',
  },
  map: { label: 'Map', hint: 'Type it `ReadonlyMap<K, readonly V[]>`.' },
  execArray: {
    label: 'RegExpExecArray',
    hint: 'Destructure the match in the same statement, or use `.test`.',
  },
  date: {
    label: 'Date',
    hint: 'Type it `Readonly<Date>`, or keep it unbound like `new Date(ms).getUTCHours()`.',
  },
  schema: {
    label: 'zod schema',
    hint: 'Zod schemas are always mutable: keep them in adapters/, or inline the call where it is used.',
  },
  regexp: {
    label: 'RegExp',
    hint: 'RegExp objects are always mutable: keep them in adapters/, or write the literal inline where it is used.',
  },
};

export function immutableTypesMessage({ kind, node, sourceFile }) {
  const declaration = node === undefined ? undefined : declarationOf(kind, node);
  const name = declaration === undefined ? undefined : declarationName(kind, declaration);
  const finding = declaration === undefined ? undefined : flaggedPart(declaration, sourceFile);
  const subject = subjectOf(kind, name);
  return `${subject} is mutable${detailOf(finding)}; domain/ values must be deeply readonly. ${hintOf(finding)}`;
}

function subjectOf(kind, name) {
  if (name === undefined) {
    return kind;
  }
  return `${kind}${kind === 'Return type' ? ' of' : ''} \`${name}\``;
}

function detailOf(finding) {
  if (finding?.member !== undefined) {
    return finding.notReadonly
      ? ` (\`${finding.member}\` is not readonly)`
      : ` (\`${finding.member}: ${finding.typeText}\`)`;
  }
  return finding?.kind === undefined ? '' : ` (${finding.label})`;
}

function hintOf(finding) {
  if (finding?.kind === undefined) {
    return GENERIC_HINT;
  }
  return finding.kind === 'class'
    ? `${finding.label} is a class and always mutable: keep it in adapters/ and pass domain code a plain value.`
    : KINDS[finding.kind].hint;
}

function declarationOf(kind, node) {
  const candidates = [node, node.parent, node.parent?.parent].filter((candidate) => candidate);
  return candidates.find(DECLARATION_MATCHERS[kind]);
}

const DECLARATION_MATCHERS = {
  Variable: (node) => ts.isVariableDeclaration(node) || ts.isBindingElement(node),
  Parameter: (node) => ts.isParameter(node),
  'Return type': (node) => ts.isFunctionLike(node),
  Property: (node) => ts.isPropertyDeclaration(node) || ts.isPropertySignature(node),
};

function declarationName(kind, declaration) {
  const nameNode = kind === 'Return type' ? functionNameNode(declaration) : declaration.name;
  return nameNode !== undefined && ts.isIdentifier(nameNode) ? nameNode.text : undefined;
}

function functionNameNode(declaration) {
  if (declaration.name !== undefined) {
    return declaration.name;
  }
  const { parent } = declaration;
  return parent !== undefined && ts.isVariableDeclaration(parent) ? parent.name : undefined;
}

function hasInitializedType(node) {
  return ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node);
}

function flaggedPart(declaration, sourceFile) {
  const typeNode = declaration.type;
  if (typeNode !== undefined) {
    return describeTypePart(mutablePart(typeNode, sourceFile), sourceFile);
  }
  if (!hasInitializedType(declaration) || declaration.initializer === undefined) {
    return undefined;
  }
  const kind = kindOfExpression(declaration.initializer);
  return kind === undefined ? undefined : { kind, label: KINDS[kind].label };
}

function describeTypePart(part, sourceFile) {
  if (part === undefined) {
    return undefined;
  }
  const typeText = part.typeNode.getText(sourceFile);
  const classified = kindOfType(part.typeNode, sourceFile);
  return {
    ...classified,
    typeText,
    ...(part.trail.length === 0
      ? {}
      : { member: part.trail.join('.'), notReadonly: part.notReadonly === true }),
  };
}

function kindOfType(typeNode, sourceFile) {
  if (ts.isArrayTypeNode(typeNode)) {
    return { kind: 'array', label: KINDS.array.label };
  }
  if (!ts.isTypeReferenceNode(typeNode)) {
    return {};
  }
  const name = typeNode.typeName.getText(sourceFile);
  const kind = TYPE_NAME_KINDS.get(name);
  if (kind !== undefined) {
    return { kind, label: KINDS[kind].label };
  }
  return MUTABLE_CLASSES.has(name) ? { kind: 'class', label: name } : {};
}

const TYPE_NAME_KINDS = new Map([
  ['Array', 'array'],
  ['Set', 'set'],
  ['Map', 'map'],
  ['Date', 'date'],
  ['RegExp', 'regexp'],
  ['RegExpExecArray', 'execArray'],
  ['RegExpMatchArray', 'execArray'],
]);

const MAX_ALIAS_DEPTH = 4;

function mutablePart(typeNode, sourceFile) {
  const pending = [{ node: typeNode, trail: [], depth: 0, notReadonly: false }];
  for (const item of pending) {
    if (item.depth > MAX_ALIAS_DEPTH) {
      continue;
    }
    const node = ts.isParenthesizedTypeNode(item.node) ? item.node.type : item.node;
    if (item.notReadonly || isMutableType(node, sourceFile)) {
      return { trail: item.trail, typeNode: node, notReadonly: item.notReadonly };
    }
    pending.push(...childrenOf(node, item, sourceFile));
  }
  return undefined;
}

function isMutableType(node, sourceFile) {
  if (ts.isArrayTypeNode(node)) {
    return true;
  }
  if (!ts.isTypeReferenceNode(node)) {
    return false;
  }
  const name = node.typeName.getText(sourceFile);
  return MUTABLE_CLASSES.has(name) || TYPE_NAME_KINDS.has(name);
}

function childrenOf(node, item, sourceFile) {
  const same = { trail: item.trail, depth: item.depth, notReadonly: false };
  if (ts.isTypeOperatorNode(node)) {
    const operand =
      node.operator === ts.SyntaxKind.ReadonlyKeyword ? elementOf(node.type) : node.type;
    return [{ ...same, node: operand }];
  }
  if (ts.isTypeReferenceNode(node)) {
    return childrenOfReference(node, item, sourceFile);
  }
  if (ts.isTypeLiteralNode(node)) {
    return membersAsItems(node.members, item, sourceFile);
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return node.types.map((member) => ({ ...same, node: member }));
  }
  return [];
}

function elementOf(typeNode) {
  return ts.isArrayTypeNode(typeNode) ? typeNode.elementType : typeNode;
}

function childrenOfReference(node, item, sourceFile) {
  const name = node.typeName.getText(sourceFile);
  const deeper = { trail: item.trail, depth: item.depth + 1, notReadonly: false };
  if (READONLY_WRAPPERS.has(name)) {
    return (node.typeArguments ?? [])
      .filter((argument) => argument.getText(sourceFile) !== 'Date')
      .map((argument) => ({ ...deeper, node: argument }));
  }
  const declaration = sourceFile.statements.find(
    (statement) =>
      (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
      statement.name.text === name,
  );
  if (declaration === undefined) {
    return [];
  }
  return ts.isTypeAliasDeclaration(declaration)
    ? [{ ...deeper, node: declaration.type }]
    : membersAsItems(declaration.members, { ...item, depth: item.depth + 1 }, sourceFile);
}

function membersAsItems(members, item, sourceFile) {
  return members
    .filter((member) => ts.isPropertySignature(member) && member.type !== undefined)
    .map((member) => ({
      node: member.type,
      trail: [...item.trail, member.name.getText(sourceFile)],
      depth: item.depth,
      notReadonly: !member.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
      ),
    }));
}

function unwrapExpression(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAwaitExpression(current)
    ) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function kindOfExpression(expression) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return 'array';
  }
  if (ts.isRegularExpressionLiteral(unwrapped)) {
    return 'regexp';
  }
  if (ts.isNewExpression(unwrapped)) {
    return TYPE_NAME_KINDS.get(unwrapped.expression.getText());
  }
  return ts.isCallExpression(unwrapped) ? kindOfCall(unwrapped) : undefined;
}

function kindOfCall(call) {
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const method = callee.name.text;
  const callText = `${callee.expression.getText()}.${method}`;
  if (callText === 'Map.groupBy') {
    return 'map';
  }
  if (method === 'exec' || method === 'match') {
    return 'execArray';
  }
  if (ARRAY_PRODUCING_STATICS.has(callText) || ARRAY_PRODUCING_METHODS.has(method)) {
    return 'array';
  }
  return rootIdentifier(callee) === 'z' ? 'schema' : undefined;
}

function rootIdentifier(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
      chain.push(current.expression);
    }
  }
  const root = chain.at(-1);
  return ts.isIdentifier(root) ? root.text : undefined;
}
