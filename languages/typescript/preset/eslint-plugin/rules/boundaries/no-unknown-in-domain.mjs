import {
  jsdocOptionSchema,
  unknownMemberTags,
  withJsdoc,
} from '../../../../../javascript/preset/documentation/jsdoc.mjs';
import ts from 'typescript';
import { ancestorsOf, variableNamed } from '../analysis/ancestry.mjs';
import { readHeadPolicy } from '../../../head-policy.mjs';
import { librariesForFile } from '../../../libraries/file-libraries.mjs';
import { validationBehavior } from '../../../libraries/project-libraries.mjs';

const PARAMETER_WRAPPERS = new Set(['AssignmentPattern', 'RestElement', 'TSParameterProperty']);

function outermostWrapper(node) {
  const pending = [node];
  for (const current of pending) {
    if (PARAMETER_WRAPPERS.has(current.parent?.type)) {
      pending.push(current.parent);
    }
  }
  return pending.at(-1);
}

function isParameter(pattern) {
  const outer = outermostWrapper(pattern);
  return Array.isArray(outer.parent?.params) && outer.parent.params.includes(outer);
}

function isAnnotatedMember(annotation) {
  const owner = annotation.parent;
  if (owner.type === 'TSPropertySignature' || owner.type === 'TSIndexSignature') {
    return true;
  }
  return owner.typeAnnotation === annotation && isParameter(owner);
}

const CAUGHT_ERROR_NAMES = new Set(['cause', 'error']);

function memberName(owner) {
  return owner.type === 'TSPropertySignature' ? owner.key?.name : owner.name;
}

function isCaughtErrorSlot(node, annotation) {
  return (
    annotation.typeAnnotation === node && CAUGHT_ERROR_NAMES.has(memberName(annotation.parent))
  );
}

const TYPE_PARAMETER_DECLARATION = 'TSTypeParameterDeclaration';

function aliasedType(sourceCode, reference) {
  if (reference.typeName.type !== 'Identifier') {
    return undefined;
  }
  const definition = variableNamed(sourceCode, reference.typeName)?.defs.find(
    ({ type }) => type === 'Type',
  );
  return definition?.node.type === 'TSTypeAliasDeclaration' && !definition.node.typeParameters
    ? definition.node.typeAnnotation
    : undefined;
}

function isUnknownMember(node) {
  return (
    node.type === 'TSUnknownKeyword' &&
    !(node.parent?.type === 'TSTypeAnnotation' && isCaughtErrorSlot(node, node.parent))
  );
}

function childNodes(sourceCode, node) {
  return (sourceCode.visitorKeys[node.type] ?? [])
    .flatMap((key) => node[key] ?? [])
    .filter(
      (child) => typeof child?.type === 'string' && child.type !== TYPE_PARAMETER_DECLARATION,
    );
}

function referencesUnknown(sourceCode, reference, services) {
  const local = aliasedType(sourceCode, reference);
  return local === undefined
    ? importedAliasHasUnknown(reference, services)
    : containsUnknown(sourceCode, local, services);
}

function containsUnknown(sourceCode, root, services) {
  const pending = [root];
  for (const current of pending) {
    if (isUnknownMember(current)) {
      return true;
    }
    const reference = current.type === 'TSTypeReference';
    const local = reference ? aliasedType(sourceCode, current) : undefined;
    if (reference && local === undefined && importedAliasHasUnknown(current, services)) {
      return true;
    }
    const next = [...childNodes(sourceCode, current), ...(local === undefined ? [] : [local])];
    pending.push(...next.filter((child) => !pending.includes(child)));
  }
  return false;
}

function typeChecker(services) {
  return services?.program === undefined || services.program === null
    ? undefined
    : services.program.getTypeChecker();
}

function aliasDeclaration(checker, symbol) {
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return target?.declarations?.find(
    (declaration) => ts.isTypeAliasDeclaration(declaration) && !declaration.typeParameters,
  );
}

function isCaughtErrorProperty(node) {
  return (
    ts.isPropertySignature(node.parent) &&
    node.parent.type === node &&
    CAUGHT_ERROR_NAMES.has(node.parent.name.getText())
  );
}

function tsContainsUnknown(checker, root) {
  const pending = [root];
  for (const current of pending) {
    if (current.kind === ts.SyntaxKind.UnknownKeyword && !isCaughtErrorProperty(current)) {
      return true;
    }
    const next = [];
    ts.forEachChild(current, (child) => {
      if (!ts.isTypeParameterDeclaration(child)) {
        next.push(child);
      }
    });
    const alias = ts.isTypeReferenceNode(current)
      ? aliasDeclaration(checker, checker.getSymbolAtLocation(current.typeName))
      : undefined;
    pending.push(
      ...[...next, ...(alias === undefined ? [] : [alias.type])].filter(
        (child) => !pending.includes(child),
      ),
    );
  }
  return false;
}

function importedAliasHasUnknown(reference, services) {
  const checker = typeChecker(services);
  const typeName = services?.esTreeNodeToTSNodeMap?.get(reference.typeName);
  const alias =
    checker === undefined || typeName === undefined
      ? undefined
      : aliasDeclaration(checker, checker.getSymbolAtLocation(typeName));
  return alias !== undefined && tsContainsUnknown(checker, alias.type);
}

function reportUnknown(context, node, data) {
  const chain = [node, ...ancestorsOf(node)];
  const memberAt = chain.findIndex(
    (current) => current.type === 'TSTypeAnnotation' && isAnnotatedMember(current),
  );
  const typeParameterAt = chain.findIndex((current) => current.type === 'TSTypeParameter');
  if (
    memberAt !== -1 &&
    (typeParameterAt === -1 || memberAt < typeParameterAt) &&
    !isCaughtErrorSlot(node, chain[memberAt])
  ) {
    context.report({ node, messageId: 'unknownType', data });
  }
}

function createVisitors(context, rootLibraries) {
  const validation = validationBehavior(librariesForFile(context.filename, rootLibraries));
  const data = { phrase: validation.phrase };
  const visitors = {
    TSUnknownKeyword: (node) => reportUnknown(context, node, data),
    TSTypeReference(node) {
      if (referencesUnknown(context.sourceCode, node, context.sourceCode.parserServices)) {
        reportUnknown(context, node, data);
      }
    },
  };
  return withJsdoc(context, visitors, {
    selectTags: unknownMemberTags,
    messageId: 'unknownType',
    data,
  });
}

export function unknownInDomainRule(rootLibraries) {
  return {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow the unknown type in parameter and property types of domain code',
        requiresTypeChecking: true,
      },
      schema: jsdocOptionSchema,
      messages: {
        unknownType:
          'domain/ code takes typed values, not unknown (also through a type alias). Write a readonly type for this value in domain/; adapters/ parses the input with {{phrase}} and passes the result in (the parsed value is assignable to a readonly type; do not import the schema type from adapters/). A caught error may be typed unknown as `cause` or `error`. If the value is genuinely opaque, add an exception for this rule in nitpicker.config.json.',
      },
    },
    create: (context) => createVisitors(context, rootLibraries),
  };
}

export const rule = unknownInDomainRule(readHeadPolicy().libraries);
