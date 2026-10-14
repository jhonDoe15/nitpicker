import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from './java-diff.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
  summarize,
} from './fixtures/gradle-e2e.mjs';

// End-to-end test of the Java preset on a tiny Gradle project. It needs Java 21, Gradle and network
// access to Maven Central (first run downloads PMD, SpotBugs, google-java-format, JaCoCo and Checkstyle), and
// lizard (pip install lizard==<version pinned in languages/java/gradle/nitpicker.init.gradle>, on the PATH or named
// by NITPICKER_LIZARD), so it only runs with NITPICKER_JAVA_E2E=1 (`npm run test:java`).
// NITPICKER_GRADLE overrides `gradle`.

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

const LEGACY = `package demo;

public final class Legacy {
  private int leftover;

  public int value() {
    return 1;
  }
}
`;

// SH5: a legacy method over the parameter limit (baselined), and the same method with new methods
// over the parameter and control nesting limits (the new ones fail).
const WIDE = `package demo;

public final class Wide {
  public int sum(int a, int b, int c, int d) {
    return a + b + c + d;
  }
}
`;

const WIDE_EXTENDED = WIDE.replace(
  '  public int sum',
  `  public int deep(int a) {
    int total = 0;
    if (a > 0) {
      for (int i = 0; i < a; i++) {
        if (i % 2 == 0) {
          total += i;
        }
      }
    }
    return total;
  }

  public int sum`,
);

const WIDE_REFORMATTED = WIDE.replace('  public int sum', '  // Still too wide.\n  public int sum');

const LEGACY_MOVED = LEGACY.replace(
  '  private int leftover;',
  '  // Kept for compatibility.\n  // See ticket 12.\n  private int leftover;',
);

const FAREWELL = `package demo;

public final class Greeter {
  public String greet(String name) {
    return "Hello, " + name + "!";
  }

  public String shout(String name) {
    return name.trim().toUpperCase(java.util.Locale.ROOT);
  }

  /** Says goodbye. */
  public String farewell(String name) {
    return "Goodbye, " + name + ".";
  }
}
`;

// The clean change's test: PIT would report a new uncovered mutant for `farewell` without it.
const GREETER_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class GreeterTest {
  @Test
  void greetsByName() {
    assertEquals("Hello, Ada!", new Greeter().greet("Ada"));
  }

  @Test
  void saysFarewell() {
    assertEquals("Goodbye, Ada.", new Greeter().farewell("Ada"));
  }
}
`;

// Tested, but not at the boundary: the `>` to `>=` mutant of clamp survives.
const CALC = `package demo;

public final class Calc {
  public int clamp(int value) {
    return value > 10 ? 10 : value;
  }
}
`;

const CALC_TEST = `package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class CalcTest {
  @Test
  void clampsAboveTen() {
    assertEquals(10, new Calc().clamp(20));
    assertEquals(5, new Calc().clamp(5));
  }
}
`;

// Empty catch block (PMD), default charset (SpotBugs) and sloppy indentation (formatter).
const BAD = `package demo;

public final class Bad {
  public String decode(byte[] bytes) {
    try {
      Integer.parseInt("x");
    } catch (NumberFormatException e) {
    }
    return new String(bytes);
  }
        public void sloppy() { }
}
`;

// What Checkstyle's bundled google_checks.xml reports on Bad.java (Javadoc is not required).
const CHECKSTYLE_PREFIX = 'com.puppycrawl.tools.checkstyle.checks.';
const CHECKSTYLE_ON_BAD = [
  'blocks.EmptyCatchBlockCheck',
  'indentation.IndentationCheck',
  'regexp.RegexpSinglelineJavaCheck',
  'whitespace.EmptyLineSeparatorCheck',
];
// Breaks the ArchitectureTest rule (no use of java.util.Date) from a class and a nested class,
// with otherwise clean code.
const STAMP = `package demo;

import java.util.Date;

public final class Stamp {
  public long now() {
    return new Date().getTime();
  }

  public static final class Inner {
    public long later() {
      return new Date().getTime() + 1;
    }
  }
}
`;

// Never exercised by a test: the `if` line has two uncovered branch outcomes on the base.
const BRANCHY = `package demo;

public final class Branchy {
  public int larger(int left, int right) {
    if (left > right) {
      return left;
    }
    return right;
  }
}
`;

// Nine branches and no test: CRAP = 10^2 * 1 + 10 = 110, over the limit of 9 (formatted, no PMD hit).
const COMPLEX = `package demo;

public final class Complex {
  private static final int T0 = 0;
  private static final int T1 = 1;
  private static final int T2 = 2;
  private static final int T3 = 3;
  private static final int T4 = 4;
  private static final int T5 = 5;
  private static final int T6 = 6;
  private static final int T7 = 7;
  private static final int T8 = 8;

  public int classify(int value) {
    int result = 0;
    if (value > T0) {
      result += 1;
    }
    if (value > T1) {
      result += 1;
    }
    if (value > T2) {
      result += 1;
    }
    if (value > T3) {
      result += 1;
    }
    if (value > T4) {
      result += 1;
    }
    if (value > T5) {
      result += 1;
    }
    if (value > T6) {
      result += 1;
    }
    if (value > T7) {
      result += 1;
    }
    if (value > T8) {
      result += 1;
    }
    return result;
  }
}
`;

// The same sizeable method in two classes: a new clone for jscpd.
const clonedClass = (name) => `package demo;

public final class ${name} {
  public int total(int a, int b) {
    int total = 0;
${Array.from({ length: 12 }, (_, i) => `    total += (a * ${i + 2}) + (b - ${i});\n    if (total > ${i * 10}) {\n      total -= ${i + 1};\n    }`).join('\n')}
    return total;
  }
}
`;
// --- coupling (SH6) fixtures: client -> stable -> churn -> leaf. `stable` (instability 1/3, used by
// both clients) depends on `churn` (instability 1/2), a less stable package.
const stabilityClass = (packageName, name, body) => `package ${packageName};

public final class ${name} {
${body}
}
`;
const STABILITY_FILES = {
  'src/main/java/client/ClientOne.java': stabilityClass(
    'client',
    'ClientOne',
    '  public int run() {\n    return new stable.Core().value();\n  }',
  ),
  'src/main/java/client/ClientTwo.java': stabilityClass(
    'client',
    'ClientTwo',
    '  public int run() {\n    return new stable.Core().value() + 1;\n  }',
  ),
  'src/main/java/stable/Core.java': stabilityClass(
    'stable',
    'Core',
    '  public int value() {\n    return new churn.Volatile().value();\n  }',
  ),
  'src/main/java/churn/Volatile.java': stabilityClass(
    'churn',
    'Volatile',
    '  public int value() {\n    return new leaf.Leaf().value();\n  }',
  ),
  'src/main/java/leaf/Leaf.java': stabilityClass(
    'leaf',
    'Leaf',
    '  public int value() {\n    return 1;\n  }',
  ),
};
// --- end coupling fixtures ---

const BRANCHY_MOVED = BRANCHY.replace(
  '  public int larger',
  '  // Picks the larger value.\n  public int larger',
);
const BRANCHY_EDITED = BRANCHY.replace('left > right', 'left >= right');
const BRANCHY_ADDED = BRANCHY.replace(
  '    return right;\n  }\n',
  `    return right;
  }

  public int smaller(int left, int right) {
    if (left < right) {
      return left;
    }
    return right;
  }
`,
);

const repeated = (count, entry) => Array(count).fill(entry);

let repository;
const sourceDirectory = 'src/main/java/demo';

function git(...args) {
  runGitIn(repository, ...args);
}

function branchWith(name, files) {
  const rooted = Object.entries(files).map(([file, content]) => [
    file.includes('/') ? file : path.join(sourceDirectory, file),
    content,
  ]);
  commitBranch(repository, name, Object.fromEntries(rooted));
}

describe.skipIf(!enabled)('Java preset end to end', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-e2e-'));
    cpSync(path.resolve(import.meta.dirname, 'fixtures/gradle-project'), repository, {
      recursive: true,
    });
    writeFileSync(path.join(repository, '.gitignore'), 'build/\n.gradle/\n');
    writeFileSync(path.join(repository, sourceDirectory, 'Legacy.java'), LEGACY);
    writeFileSync(path.join(repository, sourceDirectory, 'Branchy.java'), BRANCHY);
    writeFileSync(path.join(repository, sourceDirectory, 'Wide.java'), WIDE);
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'base with one legacy violation');
    branchWith('clean', {
      'Greeter.java': FAREWELL,
      'src/test/java/demo/GreeterTest.java': GREETER_TEST,
    });
    branchWith('moved', { 'Legacy.java': LEGACY_MOVED });
    branchWith('violation', { 'Bad.java': BAD });
    branchWith('architecture', { 'Stamp.java': STAMP });
    branchWith('complex', { 'Complex.java': COMPLEX });
    branchWith('clone', { 'Left.java': clonedClass('Left'), 'Right.java': clonedClass('Right') });
    branchWith('survivor', { 'Calc.java': CALC, 'src/test/java/demo/CalcTest.java': CALC_TEST });
    branchWith('branch-moved', { 'Branchy.java': BRANCHY_MOVED });
    branchWith('branch-edited', { 'Branchy.java': BRANCHY_EDITED });
    branchWith('branch-added', { 'Branchy.java': BRANCHY_ADDED });
    branchWith('structure-new', { 'Wide.java': WIDE_EXTENDED });
    branchWith('structure-moved', { 'Wide.java': WIDE_REFORMATTED });
    // --- coupling (SH6) branches ---
    branchWith('stability', STABILITY_FILES);
    git('checkout', '-q', '-b', 'stability-edited', 'stability');
    writeFileSync(
      path.join(repository, 'src/main/java/stable/Core.java'),
      stabilityClass(
        'stable',
        'Core',
        '  // Delegates to the volatile package.\n  public int value() {\n    return new churn.Volatile().value();\n  }',
      ),
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'stability-edited');
    // --- end coupling branches ---
  });

  afterAll(() => {
    spawnSync(gradle, ['--stop'], { stdio: 'ignore' });
    rmSync(repository, { recursive: true, force: true });
  });

  const diffOf = (branch, policy) => {
    git('checkout', '-q', branch);
    return runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle, policy });
  };

  it(
    'passes a clean change and reports the baselined legacy violations as unchanged',
    () => {
      const result = diffOf('clean');

      expect(result.failed).toBe(false);
      expect(summarize(result.newEnforceable)).toEqual([]);
      expect(summarize(result.unchangedFindings)).toEqual(
        expect.arrayContaining(['pmd UnusedPrivateField Legacy.java']),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'keeps a violation baselined when its line moves',
    () => {
      const result = diffOf('moved');

      expect(result.failed).toBe(false);
      expect(summarize(result.newFindings.filter((finding) => finding.tool !== 'jacoco'))).toEqual(
        [],
      );
      expect(summarize(result.unchangedFindings)).toEqual(
        expect.arrayContaining([
          'pmd UnusedPrivateField Legacy.java',
          'spotbugs UUF_UNUSED_FIELD Legacy.java',
        ]),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails new PMD, SpotBugs, Checkstyle and formatter violations, and untested code, as new',
    () => {
      const result = diffOf('violation');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        ...CHECKSTYLE_ON_BAD.map((check) => `checkstyle ${CHECKSTYLE_PREFIX}${check} Bad.java`),
        'google-java-format format Bad.java',
        'pit mutant-nocoverage Bad.java', // Bad.decode has no test
        'pmd EmptyCatchBlock Bad.java',
        'spotbugs DM_DEFAULT_ENCODING Bad.java',
      ]);
      expect(summarize(result.unchangedFindings)).toEqual(
        expect.arrayContaining(['pmd UnusedPrivateField Legacy.java']),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new ArchUnit violation, once per rule and offending class',
    () => {
      const result = diffOf('architecture');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'archunit no_classes_use_legacy_date Stamp.java',
        'archunit no_classes_use_legacy_date Stamp.java',
        ...repeated(3, 'pit mutant-nocoverage Stamp.java'),
      ]);
      expect(
        result.newEnforceable
          .filter((finding) => finding.tool === 'archunit')
          .map((finding) => finding.identity)
          .sort(),
      ).toEqual(['demo.Stamp', 'demo.Stamp$Inner']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new method over the CRAP limit',
    () => {
      const result = diffOf('complex');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'crap crap-score-limit Complex.java',
        ...repeated(9, 'jacoco changed-branch-coverage Complex.java'),
        ...repeated(28, 'pit mutant-nocoverage Complex.java'),
        'structure function-statements-limit Complex.java', // the method has more than 15 statements
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'honours thresholds.crapLimit: a high limit lets the complex method pass the CRAP rule',
    () => {
      const result = diffOf('complex', { crapLimit: 1_000_000 });

      expect(summarize(result.newEnforceable)).not.toContain('crap crap-score-limit Complex.java');
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'honours exclude: findings under an excluded path are dropped',
    () => {
      const result = diffOf('violation', { exclude: [`${sourceDirectory}/Bad.java`] });

      expect(result.failed).toBe(false);
      expect(result.newFindings.some((finding) => finding.path.endsWith('Bad.java'))).toBe(false);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new clone found by jscpd',
    () => {
      const result = diffOf('clone');

      expect(result.failed).toBe(true);
      expect(
        summarize(result.newEnforceable.filter((finding) => finding.tool === 'duplicates')),
      ).toEqual(['duplicates duplicate-clone Left.java']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new surviving mutant in changed code',
    () => {
      const survivor = diffOf('survivor');

      expect(survivor.failed).toBe(true);
      expect(summarize(survivor.newEnforceable)).toEqual(['pit mutant-survived Calc.java']);
      expect(survivor.newEnforceable.find((finding) => finding.tool === 'pit').message).toContain(
        'changed conditional boundary',
      );
      // The legacy uncovered mutants (Greeter.shout, Legacy.value) stay baselined.
      expect(summarize(survivor.unchangedFindings)).toEqual(
        expect.arrayContaining(['pit mutant-nocoverage Greeter.java']),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'baselines an uncovered branch whose line only moves',
    () => {
      const result = diffOf('branch-moved');

      expect(result.failed).toBe(false);
      expect(summarize(result.newEnforceable)).toEqual([]);
      expect(summarize(result.unchangedFindings)).toEqual(
        expect.arrayContaining(['jacoco changed-branch-coverage Branchy.java']),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails an uncovered branch on a changed line',
    () => {
      const result = diffOf('branch-edited');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'jacoco changed-branch-coverage Branchy.java',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a new uncovered branch and keeps the old one baselined',
    () => {
      const result = diffOf('branch-added');

      expect(result.failed).toBe(true);
      expect(summarize(result.newEnforceable)).toEqual([
        'jacoco changed-branch-coverage Branchy.java',
        ...repeated(4, 'pit mutant-nocoverage Branchy.java'),
      ]);
      expect(summarize(result.unchangedFindings)).toEqual(
        expect.arrayContaining(['jacoco changed-branch-coverage Branchy.java']),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  // SH5: the shared structure rule on Java methods.
  const structureOf = (findings) =>
    findings
      .filter((finding) => finding.tool === 'structure')
      .map(({ rule, symbol }) => `${rule} ${symbol}`);

  it(
    'fails a new method over the nesting limit and keeps the legacy wide method baselined',
    () => {
      const result = diffOf('structure-new');

      expect(result.failed).toBe(true);
      expect(structureOf(result.newEnforceable)).toEqual([
        'function-control-nesting-limit Wide.deep',
      ]);
      expect(result.newEnforceable.find((finding) => finding.tool === 'structure').message).toBe(
        'Wide.deep nests control flow 3 deep (limit 2). Return early instead of nesting.',
      );
      expect(structureOf(result.unchangedFindings)).toEqual(['function-parameters-limit Wide.sum']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  // --- coupling (SH6) cases ---
  it(
    'fails a package depending on a less stable package and reports coupling metrics as descriptive',
    () => {
      const result = diffOf('stability');

      expect(result.failed).toBe(true);
      const coupling = (findings) => findings.filter((finding) => finding.tool === 'coupling');
      expect(
        coupling(result.newEnforceable).map(({ rule, identity, message }) => ({
          rule,
          identity,
          message,
        })),
      ).toEqual([
        {
          rule: 'stability-direction',
          identity: 'package-edge:stable->churn',
          message: 'stable depends on less stable package churn',
        },
      ]);
      const metrics = coupling(result.newFindings).filter(
        (finding) => finding.classification === 'descriptive',
      );
      expect(
        metrics.find((finding) => finding.identity === 'package:stable:instability').metric,
      ).toEqual({ name: 'instability', value: 0.3333 });
      expect(
        metrics.find((finding) => finding.identity === 'package:churn:instability').metric,
      ).toEqual({ name: 'instability', value: 0.5 });
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'keeps a method over the parameter limit baselined when its line moves',
    () => {
      const result = diffOf('structure-moved');

      expect(structureOf(result.newFindings)).toEqual([]);
      expect(structureOf(result.unchangedFindings)).toEqual(['function-parameters-limit Wide.sum']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'keeps an existing stability-direction violation baselined when the package is edited',
    () => {
      git('checkout', '-q', 'stability-edited');
      const result = runJavaDiff({
        repositoryRoot: repository,
        requestedBaseRef: 'stability',
        gradle,
      });

      expect(result.newFindings.filter((finding) => finding.tool === 'coupling')).toEqual([]);
      expect(
        result.unchangedFindings
          .filter((finding) => finding.rule === 'stability-direction')
          .map((finding) => finding.identity),
      ).toEqual(['package-edge:stable->churn']);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
  // --- end coupling cases ---
});
