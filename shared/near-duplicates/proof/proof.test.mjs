import { describe, expect, it } from 'vitest';
import { findNearDuplicates } from '../engine.mjs';
import { javascriptUnits } from '../test-support/javascript.mjs';
import { inlinedTrees } from './inline.mjs';

function found(source, overridable = []) {
  const refuted = [];
  const units = javascriptUnits(source).map((unit) =>
    overridable.includes(unit.name) ? { ...unit, final: false } : unit,
  );
  const findings = findNearDuplicates(units, { refuted }).map(({ verdict, proof, units }) => ({
    verdict,
    proof,
    units: units.map((id) => id.replace('sample.js#', '')),
  }));
  const refusals = refuted.map(({ units, subject, counterexample }) => ({
    units: units.map((id) => id.replace('sample.js#', '')),
    subject,
    counterexample,
  }));
  return { findings, refusals };
}

const LOAN_CHECKS = `
function hasOverdueLoop(loans, today) {
  audit.record('overdue', loans.length, today);
  for (const loan of loans) {
    if (!loan.returned && loan.due < today) {
      return true;
    }
  }
  return false;
}
function hasOverdueSome(loans, today) {
  audit.record('overdue', loans.length, today);
  return loans.some((loan) => !loan.returned && loan.due < today);
}
function allReturnedLoop(loans, today) {
  audit.record('returned', loans.length, today);
  metrics.count('returned-check', loans.length);
  for (const loan of loans) {
    if (!loan.returned) {
      return false;
    }
  }
  return true;
}
function allReturnedEvery(loans, today) {
  audit.record('returned', loans.length, today);
  metrics.count('returned-check', loans.length);
  return loans.every((loan) => loan.returned);
}
function someReturnedLookAlike(loans, today) {
  audit.record('returned', loans.length, today);
  metrics.count('returned-check', loans.length);
  return loans.some((loan) => loan.returned);
}
`;

const MODES = `
function pickMode(strict, cached, count, limit) {
  if (count === 0) {
    throw new RangeError('no items to send');
  }
  if (strict && cached) {
    return format('strict-cached', count, limit);
  }
  if (strict) {
    return format('strict', count, limit);
  }
  return count > limit ? format('batched', count, limit) : format('single', count, limit);
}
function chooseMode(isStrict, isCached, total, max) {
  if (total === 0) {
    throw new RangeError('no items to send');
  }
  if (isStrict && !isCached) {
    return format('strict', total, max);
  }
  if (isStrict) {
    return format('strict-cached', total, max);
  }
  return total > max ? format('batched', total, max) : format('single', total, max);
}
function swappedMode(isStrict, isCached, total, max) {
  if (total === 0) {
    throw new RangeError('no items to send');
  }
  if (isStrict) {
    return format('strict', total, max);
  }
  if (isStrict && isCached) {
    return format('strict-cached', total, max);
  }
  return total > max ? format('batched', total, max) : format('single', total, max);
}
`;

const HELPERS = `
function trimmed(text, limit) {
  if (text.length === 0) {
    return 'empty';
  }
  if (text.length > limit) {
    return text.slice(0, limit).trim();
  }
  return text.trim();
}
function isShort(text, limit) {
  return text.length <= limit && text.trim().length > 0;
}
function viaHelper(text, limit) {
  if (text === null) {
    throw new TypeError('missing text for the label');
  }
  return trimmed(text, limit);
}
function spelledOut(value, max) {
  if (value === null) {
    throw new TypeError('missing text for the label');
  }
  if (value.length === 0) {
    return 'empty';
  }
  if (value.length > max) {
    return value.slice(0, max).trim();
  }
  return value.trim();
}
function viaPredicate(text, limit) {
  if (isShort(text, limit)) {
    return text.toUpperCase().split(' ').join('-');
  }
  return text.toLowerCase().split(' ').join('_');
}
function predicateSpelledOut(text, limit) {
  if (text.length <= limit && text.trim().length > 0) {
    return text.toUpperCase().split(' ').join('-');
  }
  return text.toLowerCase().split(' ').join('_');
}
function computedArgument(text, limit) {
  if (isShort(text.trim(), limit)) {
    return text.toUpperCase().split(' ').join('-');
  }
  return text.toLowerCase().split(' ').join('_');
}
`;

describe('copies proved equal by library models', () => {
  it('matches a loop with the some or every call that replaces it, and not a look-alike', () => {
    expect(found(LOAN_CHECKS).findings).toEqual([
      { verdict: 'same', proof: undefined, units: ['allReturnedEvery', 'allReturnedLoop'] },
      { verdict: 'same', proof: undefined, units: ['hasOverdueLoop', 'hasOverdueSome'] },
    ]);
  });
});

describe('copies proved equal by the solver', () => {
  it('proves guards in another order equal and refutes a reordering that changes the result', () => {
    const counterexample = 'isStrict = true, isCached = true, total = -1.0';

    expect(found(MODES)).toEqual({
      findings: [
        { verdict: 'same', proof: 'logic', units: ['pickMode', 'chooseMode'] },
        { verdict: 'parameterizable', proof: undefined, units: ['swappedMode', 'chooseMode'] },
        { verdict: 'parameterizable', proof: undefined, units: ['swappedMode', 'pickMode'] },
      ],
      refusals: [
        { units: ['swappedMode', 'chooseMode'], subject: 'outcome 2', counterexample },
        { units: ['swappedMode', 'pickMode'], subject: 'outcome 2', counterexample },
      ],
    });
  });
});

describe('copies proved equal after inlining same-file helpers', () => {
  it('inlines guard helpers and predicates, but not a call with a computed argument', () => {
    expect(found(HELPERS).findings).toEqual([
      { verdict: 'parameterizable', proof: undefined, units: ['viaPredicate', 'computedArgument'] },
      { verdict: 'same', proof: 'inlined', units: ['predicateSpelledOut', 'viaPredicate'] },
      { verdict: 'same', proof: 'inlined', units: ['spelledOut', 'viaHelper'] },
    ]);
  });

  it('leaves a helper alone when it can be overridden', () => {
    expect(found(HELPERS, ['isShort']).findings).toEqual([
      { verdict: 'parameterizable', proof: undefined, units: ['viaPredicate', 'computedArgument'] },
      { verdict: 'same', proof: 'inlined', units: ['spelledOut', 'viaHelper'] },
    ]);
  });

  it('inlines only calls whose arguments are names or literals', () => {
    expect([...inlinedTrees(javascriptUnits(HELPERS)).keys()]).toEqual([
      'sample.js#viaHelper',
      'sample.js#viaPredicate',
    ]);
  });

  it('leaves a helper alone when the file has two helpers of that name', () => {
    const units = javascriptUnits(HELPERS);
    const helper = units.find(({ name }) => name === 'isShort');
    const twin = { ...helper, id: 'sample.js#Other.isShort', name: 'Other.isShort' };

    expect([...inlinedTrees([...units, twin]).keys()]).toEqual(['sample.js#viaHelper']);
  });
});
