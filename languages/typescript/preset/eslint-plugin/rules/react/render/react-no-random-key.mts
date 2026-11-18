import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveModuleSpecifier as untypedResolveModuleSpecifier } from '../../../../modules/module-resolution.mjs';
import { nameOf, nodeChildren, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFunctionNode, type FunctionNode } from '../react-effects.mts';
import { attributeNamed, inKeyAttribute } from '../jsx.mts';
import {
  exportGenerates,
  generatorCall,
  isGeneratorModule,
  type Binding,
} from './key-generators.mts';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';

type ImportBindingDefinition = TSESLint.Scope.Definitions.ImportBindingDefinition;
type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;
type ModuleResolution = { readonly kind: string; readonly path?: string };

const resolveModuleSpecifier: (written: string, containingFile: string) => ModuleResolution =
  untypedResolveModuleSpecifier;

function memberChain(
  node: TSESTree.Node,
): { readonly root: TSESTree.Identifier; readonly names: string[] } | undefined {
  const pending = [node];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.MemberExpression && !current.computed) {
      pending.push(current.object);
    }
  }
  const root = pending.at(-1);
  return root?.type === AST_NODE_TYPES.Identifier
    ? {
        root,
        names: pending
          .toReversed()
          .flatMap(
            (part) =>
              nameOf(part.type === AST_NODE_TYPES.MemberExpression ? part.property : part) ?? [],
          ),
      }
    : undefined;
}

function importOf(sourceCode: SourceCode, identifier: TSESTree.Identifier): Binding {
  const variable = variableNamed(sourceCode, identifier);
  if (variable === undefined || variable.defs.length === 0) {
    return { bound: false };
  }
  const definition = variable.defs.find(
    (each): each is ImportBindingDefinition =>
      each.type === TSESLint.Scope.DefinitionType.ImportBinding,
  );
  const source =
    definition?.parent.type === AST_NODE_TYPES.ImportDeclaration
      ? definition.parent.source.value
      : undefined;
  return source === undefined ? { bound: true } : { bound: true, source };
}

function generatorName(sourceCode: SourceCode, callee: TSESTree.Node): string | undefined {
  const chain = memberChain(callee);
  return chain === undefined
    ? undefined
    : generatorCall(chain.names, importOf(sourceCode, chain.root));
}

function isClockRead(sourceCode: SourceCode, node: TSESTree.NewExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === 'Date' &&
    node.arguments.length === 0 &&
    !importOf(sourceCode, node.callee).bound
  );
}

function localFunctionOf(
  definition: TSESLint.Scope.Definition | undefined,
): FunctionNode | undefined {
  if (definition?.type === TSESLint.Scope.DefinitionType.FunctionName) {
    return isFunctionNode(definition.node) ? definition.node : undefined;
  }
  const init =
    definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.node.init : undefined;
  return init !== undefined && init !== null && isFunctionNode(init) ? init : undefined;
}

function returnedExpressions(fn: FunctionNode): TSESTree.Node[] {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return [fn.body];
  }
  const pending: TSESTree.Node[] = [...fn.body.body];
  const returned: TSESTree.Node[] = [];
  for (const node of pending) {
    if (node.type === AST_NODE_TYPES.ReturnStatement && node.argument !== null) {
      returned.push(node.argument);
    }
    appendAll(pending, isFunctionNode(node) ? [] : nodeChildren(node));
  }
  return returned;
}

function importedHelperGenerates(definition: ImportBindingDefinition, filename: string): boolean {
  if (definition.parent.type !== AST_NODE_TYPES.ImportDeclaration) {
    return false;
  }
  const source = definition.parent.source.value;
  const imported =
    definition.node.type === AST_NODE_TYPES.ImportSpecifier ? definition.node.imported : undefined;
  if (imported?.type !== AST_NODE_TYPES.Identifier || isGeneratorModule(source)) {
    return false;
  }
  const target = resolveModuleSpecifier(source, filename);
  return (
    target.kind === 'file' &&
    target.path !== undefined &&
    exportGenerates(target.path, imported.name)
  );
}

function helperGenerates(
  sourceCode: SourceCode,
  callee: TSESTree.Identifier,
  filename: string,
): boolean {
  const definition = variableNamed(sourceCode, callee)?.defs.at(0);
  const local = localFunctionOf(definition);
  if (local !== undefined) {
    return returnedExpressions(local).some(
      (expression) =>
        firstFoundIn(expression, (node) => directlyGeneratedBy(sourceCode, node)) !== undefined,
    );
  }
  return (
    definition?.type === TSESLint.Scope.DefinitionType.ImportBinding &&
    importedHelperGenerates(definition, filename)
  );
}

function directlyGeneratedBy(sourceCode: SourceCode, node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return isClockRead(sourceCode, node) ? 'new Date' : undefined;
  }
  return node.type === AST_NODE_TYPES.CallExpression
    ? generatorName(sourceCode, node.callee)
    : undefined;
}

function generatedBy(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  filename: string,
): string | undefined {
  const direct = directlyGeneratedBy(sourceCode, node);
  if (
    direct === undefined &&
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    helperGenerates(sourceCode, node.callee, filename)
  ) {
    return node.callee.name;
  }
  return direct;
}

function isKeyAttribute(attribute: TSESTree.JSXAttribute): boolean {
  return attributeNamed(attribute.parent, 'key') === attribute;
}

function firstFoundIn(
  root: TSESTree.Node,
  generatedOf: (node: TSESTree.Node) => string | undefined,
): string | undefined {
  const pending = [root];
  for (const node of pending) {
    const call = generatedOf(node);
    if (call !== undefined) {
      return call;
    }
    appendAll(pending, isFunctionNode(node) ? [] : nodeChildren(node));
  }
  return undefined;
}

function generatedConstant(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
  filename: string,
): string | undefined {
  const variable = variableNamed(sourceCode, identifier);
  const [definition] = variable?.defs ?? [];
  const inRender = variable?.scope.variableScope.type === TSESLint.Scope.ScopeType.function;
  const isConst =
    definition?.type === TSESLint.Scope.DefinitionType.Variable &&
    definition.parent.kind === 'const';
  const init = isConst && inRender ? definition.node.init : undefined;
  return init ? firstFoundIn(init, (node) => generatedBy(sourceCode, node, filename)) : undefined;
}

export const rule: TSESLint.RuleModule<'randomKey'> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow keys generated from randomness or the clock',
    },
    schema: [],
    messages: {
      randomKey:
        'Do not build a `key` from `{{call}}()`: it changes on every render and remounts the row. Use a stable id from the item (`key={todo.id}`) and generate ids when the item is created. An exception fits only when remounting on every render is intended.',
    },
  },
  create(context) {
    const filename = context.filename;
    function reportGenerated(node: CallLike): void {
      const call = inKeyAttribute(node)
        ? generatedBy(context.sourceCode, node, filename)
        : undefined;
      if (call !== undefined) {
        context.report({ node, messageId: 'randomKey', data: { call } });
      }
    }
    return {
      JSXAttribute(node: TSESTree.JSXAttribute) {
        const expression =
          node.value?.type === AST_NODE_TYPES.JSXExpressionContainer
            ? node.value.expression
            : undefined;
        if (isKeyAttribute(node) && expression?.type === AST_NODE_TYPES.Identifier) {
          const call = generatedConstant(context.sourceCode, expression, filename);
          if (call !== undefined) {
            context.report({ node: expression, messageId: 'randomKey', data: { call } });
          }
        }
      },
      CallExpression: reportGenerated,
      NewExpression: reportGenerated,
    };
  },
};
