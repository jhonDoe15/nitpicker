import { resolveModuleSpecifier } from '../../../../modules/module-resolution.mjs';
import { variableNamed } from '../../analysis/ancestry.mjs';
import { isFunctionNode } from '../react-effects.mjs';
import { attributeNamed, inKeyAttribute } from '../jsx.mjs';
import { exportGenerates, generatorCall, isGeneratorModule } from './key-generators.mjs';

function memberChain(node) {
  const pending = [node];
  for (const current of pending) {
    if (current.type === 'MemberExpression' && !current.computed) {
      pending.push(current.object);
    }
  }
  return pending.at(-1).type === 'Identifier'
    ? pending.toReversed().map((part) => (part.type === 'Identifier' ? part : part.property))
    : undefined;
}

function importOf(sourceCode, identifier) {
  const variable = variableNamed(sourceCode, identifier);
  if (variable === undefined || variable.defs.length === 0) {
    return { bound: false };
  }
  const definition = variable.defs.find(({ type }) => type === 'ImportBinding');
  return { bound: true, source: definition?.parent.source.value };
}

function generatorName(sourceCode, callee) {
  const chain = memberChain(callee);
  return chain === undefined
    ? undefined
    : generatorCall(
        chain.map(({ name }) => name),
        importOf(sourceCode, chain[0]),
      );
}

function isClockRead(sourceCode, node) {
  return (
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Date' &&
    node.arguments.length === 0 &&
    !importOf(sourceCode, node.callee).bound
  );
}

function localFunctionOf(definition) {
  if (definition?.type === 'FunctionName') {
    return definition.node;
  }
  const init = definition?.type === 'Variable' ? definition.node.init : undefined;
  return init !== undefined && init !== null && isFunctionNode(init) ? init : undefined;
}

function returnedExpressions(fn) {
  if (fn.body.type !== 'BlockStatement') {
    return [fn.body];
  }
  const pending = [...fn.body.body];
  const returned = [];
  for (const node of pending) {
    if (node.type === 'ReturnStatement' && node.argument !== null) {
      returned.push(node.argument);
    }
    pending.push(...(isFunctionNode(node) ? [] : childNodesOf(node)));
  }
  return returned;
}

function importedHelperGenerates(definition, filename) {
  const source = definition.parent.source.value;
  const imported =
    definition.node.type === 'ImportSpecifier' ? definition.node.imported : undefined;
  if (imported?.type !== 'Identifier' || isGeneratorModule(source)) {
    return false;
  }
  const target = resolveModuleSpecifier(source, filename);
  return target.kind === 'file' && exportGenerates(target.path, imported.name);
}

function helperGenerates(sourceCode, callee, filename) {
  const definition = variableNamed(sourceCode, callee)?.defs.at(0);
  const local = localFunctionOf(definition);
  if (local !== undefined) {
    return returnedExpressions(local).some(
      (expression) =>
        firstFoundIn(expression, (node) => directlyGeneratedBy(sourceCode, node)) !== undefined,
    );
  }
  return definition?.type === 'ImportBinding' && importedHelperGenerates(definition, filename);
}

function directlyGeneratedBy(sourceCode, node) {
  if (node.type === 'NewExpression') {
    return isClockRead(sourceCode, node) ? 'new Date' : undefined;
  }
  return node.type === 'CallExpression' ? generatorName(sourceCode, node.callee) : undefined;
}

function generatedBy(sourceCode, node, filename) {
  const direct = directlyGeneratedBy(sourceCode, node);
  const isHelper =
    direct === undefined &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    helperGenerates(sourceCode, node.callee, filename);
  return isHelper ? node.callee.name : direct;
}

function isKeyAttribute(attribute) {
  return attributeNamed(attribute.parent, 'key') === attribute;
}

function childNodesOf(node) {
  return Object.entries(node)
    .filter(([field]) => field !== 'parent')
    .flatMap(([, value]) => [value].flat())
    .filter((value) => typeof value?.type === 'string');
}

function firstFoundIn(root, generatedOf) {
  const pending = [root];
  for (const node of pending) {
    const call = generatedOf(node);
    if (call !== undefined) {
      return call;
    }
    pending.push(...(isFunctionNode(node) ? [] : childNodesOf(node)));
  }
  return undefined;
}

function generatedConstant(sourceCode, identifier, filename) {
  const variable = variableNamed(sourceCode, identifier);
  const [definition] = variable?.defs ?? [];
  const inRender = variable?.scope.variableScope.type === 'function';
  const isConst = definition?.type === 'Variable' && definition.parent.kind === 'const';
  const init = isConst && inRender ? definition.node.init : undefined;
  return init ? firstFoundIn(init, (node) => generatedBy(sourceCode, node, filename)) : undefined;
}

export const rule = {
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
    function reportGenerated(node) {
      const call = inKeyAttribute(node)
        ? generatedBy(context.sourceCode, node, filename)
        : undefined;
      if (call !== undefined) {
        context.report({ node, messageId: 'randomKey', data: { call } });
      }
    }
    return {
      JSXAttribute(node) {
        const expression =
          node.value?.type === 'JSXExpressionContainer' ? node.value.expression : undefined;
        const call =
          isKeyAttribute(node) && expression?.type === 'Identifier'
            ? generatedConstant(context.sourceCode, expression, filename)
            : undefined;
        if (call !== undefined) {
          context.report({ node: expression, messageId: 'randomKey', data: { call } });
        }
      },
      CallExpression: reportGenerated,
      NewExpression: reportGenerated,
    };
  },
};
