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

const HAS_INITIALIZED_TYPE = (node) =>
  ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node);

function flaggedPart(declaration, sourceFile) {
  const typeNode = declaration.type;
  if (typeNode !== undefined) {
    return describeTypePart(mutablePart(typeNode, { sourceFile, trail: [], depth: 0 }), sourceFile);
  }
  if (!HAS_INITIALIZED_TYPE(declaration) || declaration.initializer === undefined) {
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

function mutablePart(typeNode, context) {
  const { depth } = context;
  if (depth > MAX_ALIAS_DEPTH) {
    return undefined;
  }
  const node = ts.isParenthesizedTypeNode(typeNode) ? typeNode.type : typeNode;
  if (ts.isTypeOperatorNode(node)) {
    return mutablePart(
      node.operator === ts.SyntaxKind.ReadonlyKeyword ? elementOf(node.type) : node.type,
      context,
    );
  }
  if (
    ts.isArrayTypeNode(node) ||
    (ts.isTypeReferenceNode(node) && isMutableReference(node, context))
  ) {
    return { trail: context.trail, typeNode: node };
  }
  if (ts.isTypeReferenceNode(node)) {
    return partOfReference(node, context);
  }
  if (ts.isTypeLiteralNode(node)) {
    return partOfMembers(node.members, context);
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return firstDefined(node.types, (member) => mutablePart(member, context));
  }
  return undefined;
}

function elementOf(typeNode) {
  return ts.isArrayTypeNode(typeNode) ? typeNode.elementType : typeNode;
}

function referenceName(node, context) {
  return node.typeName.getText(context.sourceFile);
}

function isMutableReference(node, context) {
  const name = referenceName(node, context);
  return MUTABLE_CLASSES.has(name) || TYPE_NAME_KINDS.has(name);
}

function partOfReference(node, context) {
  const name = referenceName(node, context);
  const next = { ...context, depth: context.depth + 1 };
  if (READONLY_WRAPPERS.has(name)) {
    return firstDefined(node.typeArguments ?? [], (argument) =>
      isMutableClassReference(argument, context) ? undefined : mutablePart(argument, next),
    );
  }
  const declaration = context.sourceFile.statements.find(
    (statement) =>
      (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) &&
      statement.name.text === name,
  );
  if (declaration === undefined) {
    return undefined;
  }
  return ts.isTypeAliasDeclaration(declaration)
    ? mutablePart(declaration.type, next)
    : partOfMembers(declaration.members, next);
}

function isMutableClassReference(node, context) {
  return ts.isTypeReferenceNode(node) && referenceName(node, context) === 'Date';
}

function partOfMembers(members, context) {
  return firstDefined(members, (member) => {
    if (!ts.isPropertySignature(member) || member.type === undefined) {
      return undefined;
    }
    const trail = [...context.trail, member.name.getText(context.sourceFile)];
    const isReadonly = member.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
    );
    return isReadonly === true
      ? mutablePart(member.type, { ...context, trail })
      : { trail, typeNode: member.type, notReadonly: true };
  });
}

function firstDefined(items, project) {
  for (const item of items) {
    const result = project(item);
    if (result !== undefined) {
      return result;
    }
  }
  return undefined;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAwaitExpression(current)
  ) {
    current = current.expression;
  }
  return current;
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
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}
