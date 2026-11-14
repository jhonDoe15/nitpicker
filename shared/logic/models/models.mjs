import { foldTerm } from '../terms.mjs';

const MODELS = Object.freeze({
  size: {
    integer: true,
    min: 0,
    stable: true,
    reason: 'a size or length is a whole number, never negative',
  },
  index: {
    integer: true,
    min: -1,
    stable: true,
    reason: 'an index search returns -1 or a position',
  },
  absolute: {
    nonNegative: true,
    stable: true,
    reason: 'an absolute value is never negative',
  },
  random: {
    number: true,
    min: 0,
    below: 1,
    stable: false,
    reason: 'a random number is at least 0 and below 1',
  },
  stable: { stable: true, reason: 'the same call returns the same value' },
});

export function modelOf(node) {
  return node.model === undefined ? undefined : MODELS[node.model];
}

export function isStableModel(node) {
  return modelOf(node)?.stable === true;
}

function hasBounds(model) {
  return model.integer === true || model.min !== undefined || model.nonNegative === true;
}

export function boundedModelOf(node) {
  const model = modelOf(node);
  return model !== undefined && (hasBounds(model) || model.number === true) ? model : undefined;
}

function modelsIn(terms) {
  return terms.flatMap((root) =>
    foldTerm(root, (node, children) => {
      const own = boundedModelOf(node);
      return [...children.flat(), ...(own === undefined ? [] : [own])];
    }),
  );
}

/** The reason of the first model that bounds a value in `terms`. */
export function modelReason(terms) {
  return modelsIn(terms)[0]?.reason;
}

export function hasModels(terms) {
  return modelsIn(terms).length > 0;
}

/**
 * The facts a bounded value `value` stands for: `numbers` builds the constants, `notANumber` says
 * whether the value is NaN, and `compare` builds `value >= bound` style relations.
 */
export function boundFacts(z3, { model, value, notANumber, numbers }) {
  const facts = [];
  if (model.min !== undefined) {
    facts.push(value.ge(numbers.val(model.min)));
  }
  if (model.below !== undefined) {
    facts.push(value.lt(numbers.val(model.below)));
  }
  if (model.nonNegative === true) {
    facts.push(z3.Or(notANumber, value.ge(numbers.val(0))));
  }
  return facts;
}
