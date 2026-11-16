import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  componentVisitor,
  declaratorOf,
  type ComponentFrame,
} from '../react-props/react-components.mts';
import type { SourceCode } from '../typed/node-views.mts';
import { exportedFunctions, parameterOf } from './plural-inputs/exported-functions.mts';
import { pluralPairs, type PluralPair } from './plural-inputs/plural-pairs.mts';
import { schemaEntryInputs } from './plural-inputs/schema-entries.mts';
import {
  memberInputSets,
  typedInput,
  type Declarations,
  type Declared,
  type InputSet,
} from './plural-inputs/type-members.mts';

type FunctionNode = ComponentFrame['node'];
type ExportedFunction = ReturnType<typeof exportedFunctions>[number];

const INPUT_TYPE_NAME =
  /(?:Props|Options|Opts|Params|Parameters|Args|Arguments|Input|Request|Config|Settings)$/u;

function propsTypeOf(fn: FunctionNode): TSESTree.TypeNode | undefined {
  const [parameter] = fn.params;
  const annotation =
    parameter !== undefined && 'typeAnnotation' in parameter
      ? parameter.typeAnnotation?.typeAnnotation
      : undefined;
  if (annotation !== undefined) {
    return annotation;
  }
  const declared = declaratorOf(fn)?.id.typeAnnotation?.typeAnnotation;
  return declared !== undefined && 'typeArguments' in declared
    ? declared.typeArguments?.params[0]
    : undefined;
}

function optionalParameters(fn: ExportedFunction, sourceCode: SourceCode): InputSet {
  const inputs: InputSet = new Map();
  for (const parameter of fn.params.map(parameterOf)) {
    if (parameter.name !== undefined && parameter.optional && parameter.annotation !== undefined) {
      inputs.set(parameter.name, typedInput(parameter.annotation, parameter.node, sourceCode));
    }
  }
  return inputs;
}

function parameterTypes(fn: ExportedFunction): TSESTree.TypeNode[] {
  return fn.params.flatMap((parameter) => {
    const { annotation } = parameterOf(parameter);
    return annotation === undefined ? [] : [annotation];
  });
}

function isExported(
  declaration: TSESTree.TSTypeAliasDeclaration | TSESTree.TSInterfaceDeclaration,
): boolean {
  return declaration.parent.type === AST_NODE_TYPES.ExportNamedDeclaration;
}

function reportPairs(
  context: Readonly<TSESLint.RuleContext<'singularAndPlural', []>>,
  inputSets: readonly InputSet[],
): void {
  const pairs = new Map(
    inputSets.flatMap(pluralPairs).map((pair): [TSESTree.Node, PluralPair] => [pair.node, pair]),
  );
  for (const { singular, plural, node } of pairs.values()) {
    context.report({ node, messageId: 'singularAndPlural', data: { singular, plural } });
  }
}

export const rule: TSESLint.RuleModule<'singularAndPlural'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow optional alternative inputs (props, parameters, options properties, schema entries) that take one item or a list of the same item',
    },
    schema: [],
    messages: {
      singularAndPlural:
        'Optional `{{ singular }}` and `{{ plural }}` are two ways to pass the same data. Keep `{{ plural }}` and pass a single item as a one-element array.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const declarations: Declarations = new Map();
    const typeCandidates: Declared[] = [];
    const inputSets: InputSet[] = [];

    return {
      ...componentVisitor(({ node }) => {
        const propsType = propsTypeOf(node);
        if (propsType !== undefined) {
          typeCandidates.push(propsType);
        }
      }),
      TSTypeAliasDeclaration(node) {
        declarations.set(node.id.name, node.typeAnnotation);
        if (INPUT_TYPE_NAME.test(node.id.name) && isExported(node)) {
          typeCandidates.push(node.typeAnnotation);
        }
      },
      TSInterfaceDeclaration(node) {
        declarations.set(node.id.name, node.body);
        if (INPUT_TYPE_NAME.test(node.id.name) && isExported(node)) {
          typeCandidates.push(node.body);
        }
      },
      CallExpression(node) {
        const inputs = schemaEntryInputs(sourceCode, node);
        if (inputs.size > 1) {
          inputSets.push(inputs);
        }
      },
      'Program:exit'(program) {
        for (const fn of exportedFunctions(program)) {
          inputSets.push(optionalParameters(fn, sourceCode));
          typeCandidates.push(...parameterTypes(fn));
        }
        for (const candidate of typeCandidates) {
          inputSets.push(...memberInputSets(candidate, declarations, sourceCode));
        }
        reportPairs(context, inputSets);
      },
    };
  },
};
