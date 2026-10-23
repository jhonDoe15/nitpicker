import { describe, expect, it } from 'vitest';
import { JAVA_TOOLS } from '../gradle-presets.mjs';
import { isJavaFindingRule, validateJavaFindingRule } from './java-finding-rules.mjs';

describe('isJavaFindingRule', () => {
  it.each(JAVA_TOOLS)('takes a rule of %s printed as <tool>/<rule>', (tool) => {
    expect(isJavaFindingRule(`${tool}/SomeRule`)).toBe(true);
  });

  it.each(['pmd', 'pmd/', 'bogus/Rule', 'UnusedPrivateField', ''])('rejects %j', (rule) => {
    expect(isJavaFindingRule(rule)).toBe(false);
  });
});

describe('validateJavaFindingRule', () => {
  const label = 'exceptions[0].rule';
  const entry = (rule, paths = ['src/main/java/a/A.java']) => ({ rule, paths });

  it('accepts a printed rule for a Java file, and a Checkstyle check by its name', () => {
    expect(() => {
      validateJavaFindingRule(entry('pmd/UnusedPrivateField'), label);
      validateJavaFindingRule(entry('checkstyle/AbbreviationAsWordInName'), label);
    }).not.toThrow();
  });

  it('names the check a Checkstyle class stands for', () => {
    expect(() => {
      validateJavaFindingRule(
        entry(
          'checkstyle/com.puppycrawl.tools.checkstyle.checks.naming.AbbreviationAsWordInNameCheck',
        ),
        label,
      );
    }).toThrow(
      '"exceptions[0].rule" names a Checkstyle check by class; findings print the check\'s name, so write "checkstyle/AbbreviationAsWordInName"',
    );
  });

  it('rejects a Java finding whose paths all name Kotlin sources, and accepts one that names a Java file too', () => {
    expect(() => {
      validateJavaFindingRule(entry('pmd/UnusedPrivateField', ['src/main/kotlin/A.kt']), label);
    }).toThrow(
      '"exceptions[0].rule" is a pmd finding, which is reported in .java files only: its paths name Kotlin sources',
    );
    expect(() => {
      validateJavaFindingRule(
        entry('pmd/UnusedPrivateField', ['src/main/kotlin/A.kt', 'src/main/java/A.java']),
        label,
      );
    }).not.toThrow();
    expect(() => {
      validateJavaFindingRule(entry('coupling/domain-imports-io', ['src/main/kotlin/A.kt']), label);
    }).not.toThrow();
  });
});
