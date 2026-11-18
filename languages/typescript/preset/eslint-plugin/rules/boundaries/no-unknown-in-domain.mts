import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { librariesForFile as untypedLibrariesForFile } from '../../../libraries/file-libraries.mjs';
import { validationBehavior as untypedValidationBehavior } from '../../../libraries/project-libraries.mjs';
import {
  jsdocOptionSchema,
  unknownMemberTags,
  withJsdoc,
  type JsdocOptions,
} from '../typed/jsdoc-views.mts';
import {
  ancestorsOf,
  isNode,
  nameOf,
  outermostWrapper,
  variableNamed,
  type SourceCode,
} from '../typed/node-views.mts';
import { readHeadPolicy, type LibraryChoices } from '../typed/policy-views.mts';
import { ts } from '../typed/typescript-views.mts';
import { isParameterOwner } from './no-handwritten-boundary-guard.mts';

type Context = Readonly<TSESLint.RuleContext<'unknownType', JsdocOptions>>;
type Docs = { readonly requiresTypeChecking: boolean };
type Services = SourceCode['parserServices'];

const librariesForFile: (
  context: { readonly filename: string; readonly cwd: string },
  libraries: LibraryChoices,
) => LibraryChoices = untypedLibrariesForFile;
const validationBehavior: (libraries: LibraryChoices) => { readonly phrase: string } =
  untypedValidationBehavior;

const PARAMETER_WRAPPERS = new Set<string>([
  AST_NODE_TYPES.AssignmentPattern,
  AST_NODE_TYPES.RestElement,
  AST_NODE_TYPES.TSParameterProperty,
]);

function isParameter(pattern: TSESTree.Node): boolean {
  const outer = outermostWrapper(pattern, PARAMETER_WRAPPERS);
  const parent = outer.parent;
  return (
    parent !== undefined &&
    isParameterOwner(parent) &&
    parent.params.some((parameter) => parameter === outer)
  );
}

function isAnnotatedMember(annotation: TSESTree.TSTypeAnnotation): boolean {
  const owner = annotation.parent;
  if (
    owner.type === AST_NODE_TYPES.TSPropertySignature ||
    owner.type === AST_NODE_TYPES.TSIndexSignature
  ) {
    return true;
  }
  return 'typeAnnotation' in owner && owner.typeAnnotation === annotation && isParameter(owner);
}

const CAUGHT_ERROR_NAMES = new Set<string | undefined>(['cause', 'error']);

function memberName(owner: TSESTree.Node): string | undefined {
  return nameOf(owner.type === AST_NODE_TYPES.TSPropertySignature ? owner.key : owner);
}

function isCaughtErrorSlot(node: TSESTree.Node, annotation: TSESTree.TSTypeAnnotation): boolean {
  return (
    annotation.typeAnnotation === node && CAUGHT_ERROR_NAMES.has(memberName(annotation.parent))
  );
}

function aliasedType(
  sourceCode: SourceCode,
  reference: TSESTree.TSTypeReference,
): TSESTree.TypeNode | undefined {
  if (reference.typeName.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = variableNamed(sourceCode, reference.typeName)?.defs.find(
    ({ type }) => type === TSESLint.Scope.DefinitionType.Type,
  );
  return definition?.node.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
    !definition.node.typeParameters
    ? definition.node.typeAnnotation
    : undefined;
}

function isUnknownMember(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.TSUnknownKeyword &&
    !(node.parent.type === AST_NODE_TYPES.TSTypeAnnotation && isCaughtErrorSlot(node, node.parent))
  );
}

function childNodes(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node[] {
  return (sourceCode.visitorKeys[node.type] ?? [])
    .flatMap((key): readonly unknown[] => {
      const value: unknown = Reflect.get(node, key);
      return Array.isArray(value) ? value : [value];
    })
    .filter(isNode)
    .filter((child) => child.type !== AST_NODE_TYPES.TSTypeParameterDeclaration);
}

function referencesUnknown(
  sourceCode: SourceCode,
  reference: TSESTree.TSTypeReference,
  services: Services,
): boolean {
  const local = aliasedType(sourceCode, reference);
  return local === undefined
    ? importedAliasHasUnknown(reference, services)
    : containsUnknown(sourceCode, local, services);
}

function containsUnknown(sourceCode: SourceCode, root: TSESTree.Node, services: Services): boolean {
  const pending = new Set<TSESTree.Node>([root]);
  for (const current of pending) {
    if (isUnknownMember(current)) {
      return true;
    }
    const reference = current.type === AST_NODE_TYPES.TSTypeReference ? current : undefined;
    const local = reference === undefined ? undefined : aliasedType(sourceCode, reference);
    if (
      reference !== undefined &&
      local === undefined &&
      importedAliasHasUnknown(reference, services)
    ) {
      return true;
    }
    const next = [...childNodes(sourceCode, current), ...(local === undefined ? [] : [local])];
    for (const child of next) {
      pending.add(child);
    }
  }
  return false;
}

function typeChecker(services: Services): TypeScript.TypeChecker | undefined {
  return services?.program === undefined || services.program === null
    ? undefined
    : services.program.getTypeChecker();
}

function aliasDeclaration(
  checker: TypeScript.TypeChecker,
  symbol: TypeScript.Symbol | undefined,
): TypeScript.TypeAliasDeclaration | undefined {
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return target?.declarations?.find(
    (declaration): declaration is TypeScript.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(declaration) && !declaration.typeParameters,
  );
}

function isCaughtErrorProperty(node: TypeScript.Node): boolean {
  return (
    ts.isPropertySignature(node.parent) &&
    node.parent.type === node &&
    CAUGHT_ERROR_NAMES.has(node.parent.name.getText())
  );
}

function tsContainsUnknown(checker: TypeScript.TypeChecker, root: TypeScript.Node): boolean {
  const pending = new Set<TypeScript.Node>([root]);
  for (const current of pending) {
    if (current.kind === ts.SyntaxKind.UnknownKeyword && !isCaughtErrorProperty(current)) {
      return true;
    }
    const next: TypeScript.Node[] = [];
    ts.forEachChild(current, (child) => {
      if (!ts.isTypeParameterDeclaration(child)) {
        next.push(child);
      }
    });
    const alias = ts.isTypeReferenceNode(current)
      ? aliasDeclaration(checker, checker.getSymbolAtLocation(current.typeName))
      : undefined;
    for (const child of [...next, ...(alias === undefined ? [] : [alias.type])]) {
      pending.add(child);
    }
  }
  return false;
}

function importedAliasHasUnknown(reference: TSESTree.TSTypeReference, services: Services): boolean {
  const checker = typeChecker(services);
  const typeName = services?.esTreeNodeToTSNodeMap?.get(reference.typeName);
  if (checker === undefined || typeName === undefined) {
    return false;
  }
  const alias = aliasDeclaration(checker, checker.getSymbolAtLocation(typeName));
  return alias !== undefined && tsContainsUnknown(checker, alias.type);
}

function reportUnknown(
  context: Context,
  node: TSESTree.Node,
  data: { readonly phrase: string },
): void {
  const chain = [node, ...ancestorsOf(node)];
  const memberAt = chain.findIndex(
    (current) => current.type === AST_NODE_TYPES.TSTypeAnnotation && isAnnotatedMember(current),
  );
  const typeParameterAt = chain.findIndex(
    (current) => current.type === AST_NODE_TYPES.TSTypeParameter,
  );
  const member = chain[memberAt];
  if (
    member?.type === AST_NODE_TYPES.TSTypeAnnotation &&
    (typeParameterAt === -1 || memberAt < typeParameterAt) &&
    !isCaughtErrorSlot(node, member)
  ) {
    context.report({ node, messageId: 'unknownType', data });
  }
}

function createVisitors(context: Context, rootLibraries: LibraryChoices): TSESLint.RuleListener {
  const validation = validationBehavior(librariesForFile(context, rootLibraries));
  const data = { phrase: validation.phrase };
  const visitors: TSESLint.RuleListener = {
    TSUnknownKeyword(node) {
      reportUnknown(context, node, data);
    },
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

export function unknownInDomainRule(
  rootLibraries: LibraryChoices,
): TSESLint.RuleModule<'unknownType', JsdocOptions, Docs> {
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
          'domain/ code takes typed values, not unknown (also through a type alias). Write a readonly type for this value in domain/; adapters/ parses the input with {{phrase}} and passes the result in (the parsed value is assignable to a readonly type; do not import the schema type from adapters/). A caught error may be typed unknown as `cause` or `error`. An exception fits only when the value is genuinely opaque.',
      },
    },
    create: (context) => createVisitors(context, rootLibraries),
  };
}

export const rule = unknownInDomainRule(readHeadPolicy().libraries);
