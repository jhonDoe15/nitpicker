import { beforeAll, describe, expect, it } from 'vitest';
import { findNearDuplicates } from '../../../../shared/near-duplicates/engine.mjs';
import { nearDuplicateFindings } from '../../../../shared/rules/near-duplicates/near-duplicates.mjs';
import { javaParser, kotlinParser } from './test-support/parse-jvm.mjs';

const parsers = {};

beforeAll(async () => {
  parsers.java = await javaParser();
  parsers.kotlin = await kotlinParser();
});

function unitsOf(text, file) {
  return parsers[file.endsWith('.kt') ? 'kotlin' : 'java'](text, file);
}

function found(text, file) {
  const refuted = [];
  const findings = findNearDuplicates(unitsOf(text, file), { refuted }).map(
    ({ verdict, proof, units }) => ({
      verdict,
      proof,
      units: units.map((id) => id.slice(id.lastIndexOf('.') + 1)),
    }),
  );
  const refusals = refuted.map(({ units, subject, counterexample }) => ({
    units: units.map((id) => id.slice(id.lastIndexOf('.') + 1)),
    subject,
    counterexample,
  }));
  return { findings, refusals };
}

function messages(text, file) {
  return nearDuplicateFindings(unitsOf(text, file), {
    analyzerName: 'structure',
    isExcepted: () => false,
  }).map(({ message }) => message);
}

const STREAMS = `package demo;
class Checks {
  boolean hasDigitLoop(String text, int limit) {
    log.debug("checking " + text);
    metrics.count("digit-check", text.length(), limit);
    for (char c : text.toCharArray()) {
      if (Character.isDigit(c)) {
        return true;
      }
    }
    return false;
  }
  boolean hasDigitStream(String text, int limit) {
    log.debug("checking " + text);
    metrics.count("digit-check", text.length(), limit);
    return text.chars().anyMatch(Character::isDigit);
  }
  boolean allValidLoop(List<Item> items, int limit) {
    audit.record(items.size(), limit);
    for (Item item : items) {
      if (item.price() > limit || item.archived()) {
        return false;
      }
    }
    return true;
  }
  boolean allValidStream(List<Item> items, int limit) {
    audit.record(items.size(), limit);
    return items.stream().allMatch(item -> !(item.price() > limit || item.archived()));
  }
  boolean anyInvalidLookAlike(List<Item> items, int limit) {
    audit.record(items.size(), limit);
    return items.stream().anyMatch(item -> item.price() > limit || item.archived());
  }
}
`;

const KOTLIN_ANY = `package demo
object Checks {
  fun hasNegativeLoop(values: List<Int>, label: String): Boolean {
    log.debug("checking $label")
    for (v in values) {
      if (v < 0 && v != -1) {
        return true
      }
    }
    return false
  }
  fun hasNegativeAny(values: List<Int>, label: String): Boolean {
    log.debug("checking $label")
    return values.any { it < 0 && it != -1 }
  }
}
`;

const SIZES = `package demo;
class Sizes {
  String sizeLabel(int count, int limit) {
    if (count < 0) {
      throw new IllegalArgumentException("negative count");
    }
    if (count > limit * 2) {
      return "lots";
    }
    if (count > limit) {
      return "many";
    }
    return count == 0 ? "none" : "few";
  }
  String sizeName(int amount, int max) {
    if (amount < 0) {
      throw new IllegalArgumentException("negative count");
    }
    if (amount > max && amount <= max * 2) {
      return "many";
    }
    if (amount > max * 2) {
      return "lots";
    }
    return amount == 0 ? "none" : "few";
  }
  String sizeSwapped(int amount, int max) {
    if (amount > max) {
      return "many";
    }
    if (amount > max * 2) {
      return "lots";
    }
    if (amount < 0) {
      throw new IllegalArgumentException("negative count");
    }
    return amount == 0 ? "none" : "few";
  }
  int clampedIndex(int start, int size, int[] values) {
    int index = start;
    if (index >= size) {
      index = size - 1;
    }
    audit.record("clamp", index, size);
    return values[index] + values[0] * 2 + values[size - 1];
  }
  int clampedMin(int start, int size, int[] values) {
    int index = Math.min(start, size - 1);
    audit.record("clamp", index, size);
    return values[index] + values[0] * 2 + values[size - 1];
  }
}
`;

function helpers(modifiers) {
  return `package demo;
class Labels {
  ${modifiers} String rest(String text, int limit) {
    if (text.isEmpty()) {
      return "empty";
    }
    if (text.length() > limit) {
      return text.substring(0, limit).trim();
    }
    return text.trim();
  }
  String viaHelper(String text, int limit) {
    if (text == null) {
      throw new IllegalArgumentException("missing text for the label");
    }
    return rest(text, limit);
  }
  String spelledOut(String value, int max) {
    if (value == null) {
      throw new IllegalArgumentException("missing text for the label");
    }
    if (value.isEmpty()) {
      return "empty";
    }
    if (value.length() > max) {
      return value.substring(0, max).trim();
    }
    return value.trim();
  }
}
`;
}

function same(proof, ...units) {
  return { verdict: 'same', proof, units };
}

describe('JVM copies proved equal by library models', () => {
  it('matches Java loops with the stream calls that replace them, and not a look-alike', () => {
    expect(found(STREAMS, 'Checks.java').findings).toEqual([
      same(undefined, 'allValidLoop(List<Item>,int)', 'allValidStream(List<Item>,int)'),
      same(undefined, 'hasDigitLoop(String,int)', 'hasDigitStream(String,int)'),
    ]);
  });

  it('matches a Kotlin loop with the any call that replaces it', () => {
    expect(found(KOTLIN_ANY, 'Checks.kt').findings).toEqual([
      same(undefined, 'hasNegativeAny(List<Int>,String)', 'hasNegativeLoop(List<Int>,String)'),
    ]);
  });
});

describe('JVM copies proved equal by the solver', () => {
  it('proves reordered integer guards, but not a Math.min clamp whose size - 1 can overflow', () => {
    expect(found(SIZES, 'Sizes.java')).toEqual({
      findings: [same('logic', 'sizeName(int,int)', 'sizeLabel(int,int)')],
      refusals: [
        {
          units: ['clampedIndex(int,int,int[])', 'clampedMin(int,int,int[])'],
          subject: 'local 1',
          counterexample: '(size - 1) = -1, start = 0, size = 1',
        },
        {
          units: ['sizeLabel(int,int)', 'sizeSwapped(int,int)'],
          subject: 'outcome 1',
          counterexample: '(limit * 2) = -2, count = -1, limit = -1',
        },
        {
          units: ['sizeName(int,int)', 'sizeSwapped(int,int)'],
          subject: 'outcome 1',
          counterexample: '(max * 2) = -2, amount = -1, max = -1',
        },
      ],
    });
  });

  it('says in the finding that a solver proved the logic the same', () => {
    const ending =
      'Keep one, and call it from both places. If this is intended, add ' +
      '{"rule":"near-duplicate","paths":["Sizes.java"],"reason":"..."} ' +
      'to "exceptions" in nitpicker.config.json.';
    const proved =
      'apart from how its logic is written (a solver proved both give the same results).';

    expect(messages(SIZES, 'Sizes.java')).toEqual([
      `Sizes.sizeName(int,int) is a copy of Sizes.sizeLabel(int,int) (Sizes.java:3) ${proved} ${ending}`,
    ]);
  });
});

describe('JVM copies proved equal after inlining same-file helpers', () => {
  const inlined = [same('inlined', 'spelledOut(String,int)', 'viaHelper(String,int)')];

  it.each([
    ['a private helper', 'private', inlined],
    ['a static helper', 'public static', inlined],
    ['a helper a subclass can override', 'public', []],
  ])('handles %s', (_case, modifiers, expected) => {
    expect(found(helpers(modifiers), 'Labels.java').findings).toEqual(expected);
  });

  it('inlines a Kotlin helper unless it is open', () => {
    const kotlin = (modifier) => `package demo
open class Labels {
  ${modifier} fun rest(text: String, limit: Int): String {
    if (text.isEmpty()) {
      return "empty"
    }
    if (text.length > limit) {
      return text.substring(0, limit).trim()
    }
    return text.trim()
  }
  fun viaHelper(text: String?, limit: Int): String {
    if (text == null) {
      throw IllegalArgumentException("missing text for the label")
    }
    return rest(text, limit)
  }
  fun spelledOut(value: String?, max: Int): String {
    if (value == null) {
      throw IllegalArgumentException("missing text for the label")
    }
    if (value.isEmpty()) {
      return "empty"
    }
    if (value.length > max) {
      return value.substring(0, max).trim()
    }
    return value.trim()
  }
}
`;

    const kotlinFindings = ['', 'open'].map(
      (modifier) => found(kotlin(modifier), 'Labels.kt').findings,
    );

    expect(kotlinFindings).toEqual([
      [same('inlined', 'spelledOut(String?,Int)', 'viaHelper(String?,Int)')],
      [],
    ]);
  });
});
