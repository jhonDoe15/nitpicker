import { componentVisitor, declaratorOf } from '../react-props/react-components.mjs';
import { exportedFunctions, parameterOf } from './plural-inputs/exported-functions.mjs';
import { pluralPairs } from './plural-inputs/plural-pairs.mjs';
import { schemaEntryInputs } from './plural-inputs/schema-entries.mjs';
import { memberInputSets, typedInput } from './plural-inputs/type-members.mjs';

const INPUT_TYPE_NAME =
  /(?:Props|Options|Opts|Params|Parameters|Args|Arguments|Input|Request|Config|Settings)$/u;

function propsTypeOf(fn) {
  const [parameter] = fn.params;
  const annotation = parameter?.typeAnnotation?.typeAnnotation;
  if (annotation !== undefined) {
    return annotation;
  }
  const declared = declaratorOf(fn)?.id.typeAnnotation?.typeAnnotation;
  const typeArguments = declared?.typeArguments ?? declared?.typeParameters;
  return typeArguments?.params[0];
}

function optionalParameters(fn, sourceCode) {
  const inputs = new Map();
  for (const parameter of fn.params.map(parameterOf)) {
    if (parameter.name !== undefined && parameter.optional && parameter.annotation !== undefined) {
      inputs.set(parameter.name, typedInput(parameter.annotation, parameter.node, sourceCode));
    }
  }
  return inputs;
}

function parameterTypes(fn) {
  return fn.params.flatMap((parameter) => {
    const { annotation } = parameterOf(parameter);
    return annotation === undefined ? [] : [annotation];
  });
}

function isExported(declaration) {
  return declaration.parent.type === 'ExportNamedDeclaration';
}

function reportPairs(context, inputSets) {
  const pairs = new Map(inputSets.flatMap(pluralPairs).map((pair) => [pair.node, pair]));
  for (const { singular, plural, node } of pairs.values()) {
    context.report({ node, messageId: 'singularAndPlural', data: { singular, plural } });
  }
}

export const rule = {
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
    const declarations = new Map();
    const typeCandidates = [];
    const inputSets = [];

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
