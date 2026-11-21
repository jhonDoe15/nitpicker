import { foldTerm } from '../terms.mts';
import type { BoundSpace, Z3, Z3Bool } from '../typed/solver-types.mts';
import type { Model, ModelName, Term } from '../typed/term-types.mts';

const MODELS: Readonly<Record<ModelName, Model>> = Object.freeze({
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

export function modelOf(node: Term): Model | undefined {
  return node.model === undefined ? undefined : MODELS[node.model];
}

export function isStableModel(node: Term): boolean {
  return modelOf(node)?.stable === true;
}

function hasBounds(model: Model): boolean {
  return model.integer === true || model.min !== undefined || model.nonNegative === true;
}

export function boundedModelOf(node: Term): Model | undefined {
  const model = modelOf(node);
  return model !== undefined && (hasBounds(model) || model.number === true) ? model : undefined;
}

function modelsIn(terms: readonly Term[]): Model[] {
  return terms.flatMap((root) =>
    foldTerm<Model[]>(root, (node, children) => {
      const own = boundedModelOf(node);
      return [...children.flat(), ...(own === undefined ? [] : [own])];
    }),
  );
}

export function modelReason(terms: readonly Term[]): string | undefined {
  return modelsIn(terms)[0]?.reason;
}

export function hasModels(terms: readonly Term[]): boolean {
  return modelsIn(terms).length > 0;
}

export function boundFacts<Bound>(
  z3: Z3,
  {
    model,
    value,
    notANumber,
    numbers,
  }: BoundSpace<Bound> & { readonly model: Model; readonly notANumber: Z3Bool },
): Z3Bool[] {
  const facts: Z3Bool[] = [];
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
