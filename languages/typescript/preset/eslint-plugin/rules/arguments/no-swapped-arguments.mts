import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typedScopeOf } from '../promises/cannot-reject.mts';
import { ts } from '../typed/typescript-views.mts';
import { findSwaps } from './swapped-names.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'swappedArguments';
type CallLike = TSESTree.CallExpression | TSESTree.NewExpression;

function argumentName(node: TSESTree.CallExpressionArgument): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.object.type === AST_NODE_TYPES.ThisExpression &&
    node.property.type === AST_NODE_TYPES.Identifier
    ? node.property.name
    : undefined;
}

function givenNames(call: CallLike): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  for (const argument of call.arguments) {
    if (argument.type === AST_NODE_TYPES.SpreadElement) {
      break;
    }
    names.push(argumentName(argument));
  }
  return names;
}

function isProjectSource(program: TypeScript.Program, file: TypeScript.SourceFile): boolean {
  return !(
    file.isDeclarationFile ||
    program.isSourceFileFromExternalLibrary(file) ||
    program.isSourceFileDefaultLibrary(file)
  );
}

type Callee = {
  readonly names: string[];
  readonly declaration: TypeScript.SignatureDeclaration;
};

function calleeOf(
  program: TypeScript.Program,
  signature: TypeScript.Signature,
): Callee | undefined {
  const { declaration } = signature;
  if (
    declaration === undefined ||
    ts.isJSDocSignature(declaration) ||
    ts.isJSDocFunctionType(declaration) ||
    !isProjectSource(program, declaration.getSourceFile())
  ) {
    return undefined;
  }
  const names: string[] = [];
  for (const parameter of declaration.parameters) {
    if (parameter.dotDotDotToken !== undefined || !ts.isIdentifier(parameter.name)) {
      break;
    }
    if (parameter.name.text !== 'this') {
      names.push(parameter.name.text);
    }
  }
  return { names, declaration };
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow an argument named like a different parameter of the called function',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      swappedArguments:
        '`{{ passed }}` is passed as `{{ slot }}` and `{{ other }}` as `{{ otherSlot }}`; did you swap them? Pass the arguments in the order of the parameters.',
    },
  },
  create(context) {
    const scope = typedScopeOf(context);
    if (scope === undefined) {
      return {};
    }
    const { services } = scope;
    const checker = services.program.getTypeChecker();

    function check(call: CallLike): void {
      const given = givenNames(call);
      if (given.length < 2 || given.every((name) => name === undefined)) {
        return;
      }
      const tsCall = services.esTreeNodeToTSNodeMap.get(call);
      const signature = checker.getResolvedSignature(tsCall);
      if (signature === undefined) {
        return;
      }
      const callee = calleeOf(services.program, signature);
      if (callee === undefined) {
        return;
      }
      const parameters = callee.names;
      const recursive = context.sourceCode
        .getAncestors(call)
        .some((ancestor) => services.esTreeNodeToTSNodeMap.get(ancestor) === callee.declaration);
      for (const swap of findSwaps(parameters, given, recursive)) {
        context.report({
          node: call,
          messageId: 'swappedArguments',
          data: {
            passed: given[swap.index] ?? '',
            slot: parameters[swap.index] ?? '',
            other: given[swap.other] ?? '',
            otherSlot: parameters[swap.other] ?? '',
          },
        });
      }
    }

    return { CallExpression: check, NewExpression: check };
  },
};
