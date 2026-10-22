import { describe, expect, it } from 'vitest';
import { useProjects } from '../test-support/projects.mjs';
import { detectProject } from './detect-project.mjs';

const project = useProjects();
const SOURCE = 'export const value = 1;\n';
const TYPED_SOURCE = 'export const value: number = 1;\n';
const MAVEN_KOTLIN_NOTE =
  'This Maven project has more Kotlin than Java sources, but the kotlin preset needs a Gradle build, so the java preset is set. It checks the Java sources.';
const NO_SOURCES_NOTE =
  'No TypeScript or JavaScript sources under src yet, so the TypeScript preset is set. For another layout, set "layout.sourceRoots" in nitpicker.config.json.';

function detected(files) {
  const { preset, family, summary, notes } = detectProject(project(files));
  return { preset, family, summary, notes };
}

function node(preset, summary, notes = []) {
  return { preset, family: 'node', summary, notes };
}

function python(summary) {
  return { preset: 'python', family: 'python', summary, notes: [] };
}

function jvm(preset, summary, notes = []) {
  return { preset, family: 'jvm', summary, notes };
}

describe('TypeScript and JavaScript detection', () => {
  it('picks TypeScript for TypeScript sources', () => {
    expect(detected({ 'package.json': '{}', 'src/index.ts': TYPED_SOURCE })).toEqual(
      node('typescript', 'TypeScript, npm, Vitest'),
    );
  });

  it('picks JavaScript for JavaScript sources without TypeScript or a tsconfig', () => {
    const expected = node('javascript', 'JavaScript, npm, Vitest');

    expect(detected({ 'package.json': '{}', 'src/index.js': SOURCE })).toEqual(expected);
    expect(detected({ 'package.json': '{}', 'src/index.mjs': SOURCE })).toEqual(expected);
  });

  it('picks JavaScript for a project that has no package.json yet', () => {
    expect(detected({ 'src/index.js': SOURCE })).toEqual(
      node('javascript', 'JavaScript, npm, Vitest'),
    );
  });

  it('keeps TypeScript when a tsconfig.json exists', () => {
    const files = { 'package.json': '{}', 'tsconfig.json': '{}', 'src/index.js': SOURCE };

    expect(detected(files)).toEqual(node('typescript', 'TypeScript, npm, Vitest'));
  });

  it('keeps TypeScript when one TypeScript file sits among JavaScript ones', () => {
    const files = { 'package.json': '{}', 'src/a.js': SOURCE, 'src/b.mts': TYPED_SOURCE };

    expect(detected(files)).toEqual(node('typescript', 'TypeScript, npm, Vitest'));
  });

  it('keeps TypeScript for JSX sources, which only that preset reads', () => {
    expect(detected({ 'package.json': '{}', 'src/App.jsx': SOURCE })).toEqual(
      node('typescript', 'TypeScript, npm, Vitest'),
    );
  });

  it('names React in a TypeScript project that depends on it', () => {
    const files = {
      'package.json': '{"dependencies":{"react":"19.0.0"}}',
      'src/App.tsx': TYPED_SOURCE,
    };

    expect(detected(files)).toEqual(node('typescript', 'TypeScript with React, npm, Vitest'));
  });

  it('never calls a JavaScript project a React project', () => {
    const files = { 'package.json': '{"dependencies":{"react":"19.0.0"}}', 'src/a.js': SOURCE };

    expect(detected(files)).toEqual(node('javascript', 'JavaScript, npm, Vitest'));
  });

  it('follows the package manager and the test runner the project uses', () => {
    const files = {
      'package.json': '{"scripts":{"test":"jest"}}',
      'pnpm-lock.yaml': '',
      'src/index.ts': TYPED_SOURCE,
    };

    expect(detected(files)).toEqual(node('typescript', 'TypeScript, pnpm, Jest'));
  });

  it('says the JavaScript preset runs Vitest only when the project uses another runner', () => {
    const files = { 'package.json': '{"scripts":{"test":"mocha"}}', 'src/index.js': SOURCE };

    expect(detected(files)).toEqual(
      node('javascript', 'JavaScript, npm, Vitest', [
        'The JavaScript preset runs Vitest only, so a Mocha project cannot pass yet. See "JavaScript preset" in docs/usage.md.',
      ]),
    );
  });

  it('assumes TypeScript for a new package without sources and says so', () => {
    expect(detected({ 'package.json': '{}' })).toEqual(
      node('typescript', 'TypeScript, npm, Vitest', [NO_SOURCES_NOTE]),
    );
  });

  it('stops with advice when the folder holds no project', () => {
    const root = project({ 'README.md': '' });

    expect(() => detectProject(root)).toThrow(
      `Nothing to detect in ${root}: no package.json, pom.xml, build.gradle, pyproject.toml ` +
        "or other project file. Run nitpicker init in the project's directory.",
    );
  });
});

describe('Java and Kotlin detection', () => {
  const GRADLE_NOTE =
    'There is no gradlew, so nitpicker runs gradle from the PATH. Install it, or add the wrapper.';
  const MAVEN_NOTE =
    'There is no mvnw, so nitpicker runs mvn from the PATH. Install it, or add the wrapper.';

  it('picks Java on Gradle', () => {
    const files = { 'build.gradle': '', gradlew: '', 'src/main/java/App.java': 'class App {}' };

    expect(detected(files)).toEqual(jvm('java', 'Java, Gradle'));
  });

  it('picks Java on Maven', () => {
    const files = { 'pom.xml': '<project/>', mvnw: '', 'src/main/java/App.java': 'class App {}' };

    expect(detected(files)).toEqual(jvm('java', 'Java, Maven'));
  });

  it('picks Kotlin on Gradle when Kotlin sources outnumber Java ones', () => {
    const files = {
      'build.gradle.kts': '',
      gradlew: '',
      'src/main/kotlin/App.kt': '',
      'src/main/kotlin/Other.kt': '',
      'src/main/java/Legacy.java': '',
    };

    expect(detectProject(project(files))).toEqual({
      ...jvm('kotlin', 'Kotlin, Gradle'),
      buildTool: 'gradle',
      javaSources: true,
    });
  });

  it('reports a Kotlin project without Java sources as such', () => {
    const files = { 'build.gradle.kts': '', gradlew: '', 'src/main/kotlin/App.kt': '' };

    expect(detectProject(project(files))).toEqual({
      ...jvm('kotlin', 'Kotlin, Gradle'),
      buildTool: 'gradle',
      javaSources: false,
    });
  });

  it('sets the Java preset for Kotlin sources on Maven and says why', () => {
    const files = { 'pom.xml': '<project/>', 'src/main/kotlin/App.kt': '' };

    expect(detected(files)).toEqual(jvm('java', 'Java, Maven', [MAVEN_KOTLIN_NOTE, MAVEN_NOTE]));
  });

  it('asks for the wrapper when the build has none', () => {
    expect(detected({ 'build.gradle': '' })).toEqual(jvm('java', 'Java, Gradle', [GRADLE_NOTE]));
  });

  it('is quiet about the build tool when the wrapper is there', () => {
    expect(detected({ 'build.gradle': '', gradlew: '' }).notes).toEqual([]);
    expect(detected({ 'pom.xml': '', mvnw: '' }).notes).toEqual([]);
  });

  it('lets a Java build own the folder when it has JavaScript assets but no package.json', () => {
    const files = { 'pom.xml': '', mvnw: '', 'src/main/web/app.js': SOURCE };

    expect(detected(files)).toEqual(jvm('java', 'Java, Maven'));
  });
});

describe('Python detection', () => {
  it('picks Python from pyproject.toml and reads the tools the project declares', () => {
    const files = {
      'pyproject.toml': '[tool.poetry]\nname = "demo"\n[tool.black]\nline-length = 88\n',
      'poetry.lock': '',
      'pkg/__init__.py': '',
      'pkg/mod.py': '',
      'tests/test_mod.py': 'def test_it():\n    assert True\n',
    };

    expect(detected(files)).toEqual(python('Python, poetry, pytest, mypy, black'));
  });

  it('picks Python from requirements.txt', () => {
    const files = { 'requirements.txt': 'flask\npyright\n', 'app.py': '' };

    expect(detected(files)).toEqual(python('Python, path, unittest, pyright, ruff'));
  });

  it('reads uv from the lockfile and from [tool.uv]', () => {
    const expected = python('Python, uv, unittest, mypy, ruff');

    expect(detected({ 'pyproject.toml': '', 'uv.lock': '' })).toEqual(expected);
    expect(detected({ 'pyproject.toml': '[tool.uv]\n' })).toEqual(expected);
  });

  it('reads pdm from its lockfile', () => {
    expect(detected({ 'pyproject.toml': '', 'pdm.lock': '' })).toEqual(
      python('Python, pdm, unittest, mypy, ruff'),
    );
  });

  it('reads pipenv from the Pipfile', () => {
    expect(detected({ Pipfile: '' })).toEqual(python('Python, pipenv, unittest, mypy, ruff'));
  });

  it('lets a package.json claim TypeScript sources next to Python tooling', () => {
    const files = { 'package.json': '{}', 'pyproject.toml': '', 'src/index.ts': TYPED_SOURCE };

    expect(detected(files)).toEqual(node('typescript', 'TypeScript, npm, Vitest'));
  });

  it('lets Python own a folder with TypeScript sources and no package.json', () => {
    expect(detected({ 'pyproject.toml': '', 'src/index.ts': TYPED_SOURCE })).toEqual(
      python('Python, path, unittest, mypy, ruff'),
    );
  });
});
