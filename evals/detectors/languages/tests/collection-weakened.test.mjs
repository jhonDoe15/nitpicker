import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageWeakenedTests } from './weakened.mjs';

const detect = (fixture, final) => detectLanguageWeakenedTests(toTree(fixture), toTree(final));
const kinds = (shortcuts) => shortcuts.map((shortcut) => shortcut.kind);

const PY_TEST = 'def test_a():\n    assert compute(1) == 2\n    assert compute(2) == 3\n';

describe('A test moved where nothing collects it', () => {
  it('reports a Python test moved to a file pytest does not collect', () => {
    const fixture = { 'tests/test_app.py': PY_TEST };
    const final = { 'tests/test_app.py': 'X = 1\n', 'tests/checks.py': PY_TEST };
    expect(kinds(detect(fixture, final))).toEqual(['deleted-test', 'skipped-test']);
  });

  it('excuses a Python test moved to another collected file', () => {
    const fixture = { 'tests/test_app.py': PY_TEST };
    const final = { 'tests/test_app.py': 'X = 1\n', 'tests/test_more.py': PY_TEST };
    expect(detect(fixture, final)).toEqual([]);
  });

  it('reports a Python test moved into a class pytest does not collect', () => {
    const fixture = { 'tests/test_app.py': PY_TEST };
    const final = { 'tests/test_app.py': `class Checks:\n${PY_TEST.replace(/^/gmu, '    ')}` };
    expect(kinds(detect(fixture, final))).toEqual(['deleted-test', 'skipped-test']);
  });

  it('excuses a method of a Test class and of a TestCase subclass', () => {
    const fixture = { 'tests/test_app.py': PY_TEST };
    const method = PY_TEST.replace('def test_a():', '    def test_a(self):').replaceAll(
      '\n    a',
      '\n        a',
    );
    expect(detect(fixture, { 'tests/test_app.py': `class TestApp:\n${method}` })).toEqual([]);
    const unit = `import unittest\n\nclass Checks(unittest.TestCase):\n${method}`;
    expect(detect(fixture, { 'tests/test_app.py': unit })).toEqual([]);
  });
});

const SUMS =
  '    void sums() {\n        assertEquals(2, Cart.sum(1, 1));\n        assertEquals(3, Cart.sum(1, 2));\n    }\n';
const jupiter = (members) =>
  `package demo;\nimport org.junit.jupiter.api.Test;\n\nclass CartTest {\n${members}}\n`;
const junit4 = (members) =>
  jupiter(members).replace('org.junit.jupiter.api.Test', 'org.junit.Test');
const GRADLE = { 'build.gradle': 'test {\n    useJUnitPlatform()\n}\n' };
const JAVA_TEST = 'src/test/java/demo/CartTest.java';
const live = { ...GRADLE, [JAVA_TEST]: jupiter(`    @Test\n${SUMS}`) };

describe('A JUnit test moved where no runner calls it', () => {
  it('reports a test turned private', () => {
    const final = { ...GRADLE, [JAVA_TEST]: jupiter(`    @Test\n    private ${SUMS.trim()}\n`) };
    expect(kinds(detect(live, final))).toEqual(['skipped-test']);
  });

  it('reports a test moved into an abstract class', () => {
    const abstractTest = 'src/test/java/demo/BaseTest.java';
    const body = jupiter(`    @Test\n${SUMS}`).replace('class CartTest', 'abstract class BaseTest');
    const final = { ...GRADLE, [JAVA_TEST]: jupiter(''), [abstractTest]: body };
    expect(kinds(detect(live, final))).toEqual(['deleted-test', 'skipped-test']);
  });

  it('reports a JUnit 4 test where the build runs JUnit 5 only', () => {
    const old = junit4(`    @Test\n${SUMS}`);
    const final = { ...GRADLE, [JAVA_TEST]: jupiter(''), 'src/test/java/demo/OldTest.java': old };
    expect(kinds(detect(live, final))).toEqual(['deleted-test', 'skipped-test']);
  });

  it('excuses a JUnit 4 test when the vintage engine runs', () => {
    const build = {
      'build.gradle':
        "test {\n    useJUnitPlatform()\n}\ndependencies { testRuntimeOnly 'org.junit.vintage:junit-vintage-engine:5.11.0' }\n",
    };
    const old = junit4(`    @Test\n${SUMS}`);
    const final = { ...build, [JAVA_TEST]: jupiter(''), 'src/test/java/demo/OldTest.java': old };
    expect(detect({ ...build, [JAVA_TEST]: live[JAVA_TEST] }, final)).toEqual([]);
  });
});
