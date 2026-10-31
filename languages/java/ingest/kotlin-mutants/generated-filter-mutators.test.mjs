import { describe, expect, it } from 'vitest';
import { FILE, emptyClass, filterFor, mutant } from './test-support/filter-helpers.mjs';

const suspendDescription = '(ILkotlin/coroutines/Continuation;)Ljava/lang/Object;';
const invokeSuspend = {
  className: 'demo.DemoKt$numbers$1',
  method: 'invokeSuspend',
  methodDescription: '(Ljava/lang/Object;)Ljava/lang/Object;',
};
const fetch = { method: 'fetch', methodDescription: suspendDescription };

function removedConditional(kind) {
  return {
    mutatorName: `RemoveConditionalMutator_${kind}`,
    description: 'removed conditional - replaced equality check with true',
  };
}

function assignment(field) {
  return {
    mutatorName: 'MemberVariableMutator',
    description: `Removed assignment to member variable ${field}`,
  };
}

describe('the conditionals and switches of the state machine', () => {
  const filter = filterFor({ branching: [7] });
  const removeSwitch = { mutatorName: 'RemoveSwitchMutator_1', description: 'RemoveSwitch 1' };
  const swapSwitch = { mutatorName: 'SwitchMutator', description: 'replaced switch default' };

  it.each([
    ['a removed conditional', removedConditional('EQUAL_IF')],
    ['a removed conditional forced false', removedConditional('EQUAL_ELSE')],
    ['a removed switch case', removeSwitch],
    ['a swapped switch default', swapSwitch],
  ])('drops %s on a line without branching syntax', (name, kind) => {
    expect([
      filter(mutant({ ...invokeSuspend, ...kind, line: 6 }), FILE),
      filter(mutant({ ...fetch, ...kind, line: 6 }), FILE),
    ]).toEqual(['state-machine-branch', 'state-machine-branch']);
  });

  it('keeps them on a line with branching syntax and in a function that is not suspend', () => {
    expect([
      filter(mutant({ ...fetch, ...removedConditional('EQUAL_IF'), line: 7 }), FILE),
      filter(mutant({ ...fetch, ...removeSwitch, line: 7 }), FILE),
      filter(mutant({ method: 'plain', ...removedConditional('EQUAL_IF'), line: 6 }), FILE),
    ]).toEqual([undefined, undefined, undefined]);
  });
});

describe('the fields of a coroutine state machine', () => {
  const filter = filterFor({
    classes: [
      { ...emptyClass, name: 'demo.DemoKt' },
      {
        ...emptyClass,
        name: 'demo.Tagged',
        properties: [{ name: 'label', start: 3, end: 3, constructor: false }],
      },
    ],
  });

  it.each(['L$0', 'I$1', 'Z$0', 'label'])(
    'drops the assignment of %s in invokeSuspend and in a suspend function',
    (field) => {
      expect([
        filter(mutant({ ...invokeSuspend, ...assignment(field) }), FILE),
        filter(mutant({ ...fetch, ...assignment(field) }), FILE),
      ]).toEqual(['coroutine-state-field', 'coroutine-state-field']);
    },
  );

  it('keeps a written field, a label property of the class and a field set outside a coroutine', () => {
    expect([
      filter(mutant({ ...fetch, ...assignment('count') }), FILE),
      filter(mutant({ ...fetch, className: 'demo.Tagged', ...assignment('label') }), FILE),
      filter(mutant({ method: 'plain', ...assignment('L$0') }), FILE),
      filter(mutant({ method: 'plain', ...assignment('label') }), FILE),
    ]).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('the last branch of an exhaustive when', () => {
  const filter = filterFor({ branching: [11, 12, 13], exhaustiveLastEntries: [13] });

  it('drops the check of the last branch forced true, which no input can tell apart', () => {
    expect(
      filter(mutant({ method: 'area', ...removedConditional('EQUAL_IF'), line: 13 }), FILE),
    ).toBe('exhaustive-when-last-branch');
  });

  it('keeps the same check forced false, other mutants of that line and the other branches', () => {
    expect([
      filter(mutant({ method: 'area', ...removedConditional('EQUAL_ELSE'), line: 13 }), FILE),
      filter(
        mutant({
          method: 'area',
          mutatorName: 'NegateConditionalsMutator',
          description: 'negated conditional',
          line: 13,
        }),
        FILE,
      ),
      filter(mutant({ method: 'area', ...removedConditional('EQUAL_IF'), line: 12 }), FILE),
    ]).toEqual([undefined, undefined, undefined]);
  });
});
