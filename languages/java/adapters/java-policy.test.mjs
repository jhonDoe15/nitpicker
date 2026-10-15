import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createJavaAnalyzer } from './java-analyzer.mjs';
import { JAVA_TOOLS } from './gradle-presets.mjs';
import { applyJavaPolicy, configureJavaAnalyzer } from './java-policy.mjs';
import { toolConfigProperties } from './java-diff.mjs';
import { parseRunnerArguments } from './java-runner.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function inventoryRoot(sites) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-policy-'));
  roots.push(root);
  writeFileSync(path.join(root, 'nitpicker.legacy.json'), JSON.stringify({ sites }));
  return root;
}

const finding = (file, identity = 'id') => ({
  tool: 'pmd',
  rule: 'Rule',
  path: file,
  identity,
  classification: 'enforceable',
});
const allow = (file, count, source = 'id') => ({ file, rule: 'Rule', source, count });

const context = () => ({
  projectRoot: '/p',
  toolRoot: '/t',
  snapshot: 'head',
  projectPolicyRoot: tmpdir(),
  baselineRoot: tmpdir(),
});

describe('configureJavaAnalyzer', () => {
  it('leaves the analyzer untouched without any shared config', () => {
    const analyzer = createJavaAnalyzer();
    expect(configureJavaAnalyzer(analyzer, {})).toBe(analyzer);
  });

  it('hands thresholds, exclude, inventory and roots to the runner and changes the hash', () => {
    const analyzer = createJavaAnalyzer();
    const configured = configureJavaAnalyzer(analyzer, {
      thresholds: { crapLimit: 12 },
      exclude: ['a/**', 'b/*.java'],
      legacyInventory: 'legacy.json',
    });

    const { args } = configured.createInvocation(context());
    const parsed = parseRunnerArguments(args.slice(1));

    expect(parsed.projectRoot).toBe('/p');
    expect(parsed.policy).toEqual({
      crapLimit: 12,
      fileLimits: undefined,
      exclude: ['a/**', 'b/*.java'],
      exceptions: [],
      legacyInventory: 'legacy.json',
      policyRoot: '/tmp',
      baselineRoot: '/tmp',
      snapshot: 'head',
      preset: undefined,
      kotlinFormatter: undefined,
      kotlinDetektConfig: undefined,
    });
    expect(configured.configurationHash).not.toBe(analyzer.configurationHash);
    expect(
      configureJavaAnalyzer(analyzer, { thresholds: { crapLimit: 13 } }).configurationHash,
    ).not.toBe(configured.configurationHash);
    expect(configured.legacyInventory).toBe('legacy.json');
  });

  it('hands each exception path to the runner as a rule and a glob and changes the hash', () => {
    const analyzer = createJavaAnalyzer({ kotlin: true });
    const exceptions = [
      {
        rule: 'detekt.style.ForbiddenMethodCall',
        paths: ['a/Main.kt', 'b/**'],
        reason: 'Entry point.',
      },
      { rule: 'detekt.style.UseDataClass', paths: ['c/*.kt'], reason: 'Mapped by a framework.' },
    ];
    const configured = configureJavaAnalyzer(analyzer, { exceptions });

    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));

    expect(parsed.policy.exceptions).toEqual([
      { rule: 'detekt.style.ForbiddenMethodCall', glob: 'a/Main.kt' },
      { rule: 'detekt.style.ForbiddenMethodCall', glob: 'b/**' },
      { rule: 'detekt.style.UseDataClass', glob: 'c/*.kt' },
    ]);
    expect(configured.configurationHash).not.toBe(analyzer.configurationHash);
    expect(
      configureJavaAnalyzer(analyzer, { exceptions: [exceptions[0]] }).configurationHash,
    ).not.toBe(configured.configurationHash);
  });

  it('hands the Kotlin formatter and detekt config to the runner and changes the hash', () => {
    const analyzer = createJavaAnalyzer({ kotlin: true });
    const configured = configureJavaAnalyzer(analyzer, {
      kotlin: { formatter: 'ktfmt', detektConfig: 'tools/rules.yml' },
    });

    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));

    expect(parsed.policy).toEqual({
      crapLimit: undefined,
      exclude: [],
      exceptions: [],
      legacyInventory: undefined,
      policyRoot: '/tmp',
      baselineRoot: '/tmp',
      snapshot: 'head',
      preset: 'kotlin',
      kotlinFormatter: 'ktfmt',
      kotlinDetektConfig: 'tools/rules.yml',
    });
    expect(configured.configurationHash).not.toBe(analyzer.configurationHash);
    expect(
      configureJavaAnalyzer(analyzer, { kotlin: { detektConfig: 'tools/rules.yml' } })
        .configurationHash,
    ).not.toBe(analyzer.configurationHash);
  });

  it('declares every tool the Java reports produce', () => {
    expect(createJavaAnalyzer().reportedTools).toEqual(JAVA_TOOLS);
    expect([...new Set(JAVA_TOOLS)].sort()).toEqual([
      'archunit',
      'checkstyle',
      'coupling',
      'crap',
      'duplicates',
      'google-java-format',
      'jacoco',
      'pit',
      'pmd',
      'spotbugs',
      'spring',
      'structure',
      'test-runtime',
    ]);
  });
});

describe('project tool configs', () => {
  function projectWith(files) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-tools-'));
    roots.push(root);
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    return root;
  }
  const tools = {
    pmd: { precedence: ['project', 'nitpicker'] },
    checkstyle: { precedence: ['project'] },
  };

  it('hands the precedence to the runner and hashes the project files it opts into', () => {
    const analyzer = createJavaAnalyzer();
    const configured = configureJavaAnalyzer(analyzer, { tools });
    const root = projectWith({ 'config/pmd/ruleset.xml': '<ruleset/>' });

    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));
    const before = configured.resolveConfigurationHash(root);
    writeFileSync(path.join(root, 'config/pmd/ruleset.xml'), '<ruleset name="edited"/>');

    expect(parsed.policy.toolPrecedence).toEqual({
      pmd: ['project', 'nitpicker'],
      checkstyle: ['project'],
    });
    expect(configured.configurationHash).not.toBe(analyzer.configurationHash);
    expect(configured.resolveConfigurationHash(root)).not.toBe(before);
    expect(configureJavaAnalyzer(analyzer, {}).resolveConfigurationHash).toBeUndefined();
  });

  it('hashes every file in the opted-in config folders', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), { tools });
    const root = projectWith({
      'config/pmd/ruleset.xml': '<ruleset/>',
      'config/checkstyle/checkstyle.xml': '<module/>',
      'config/checkstyle/suppressions.xml': '<suppressions/>',
    });

    const before = configured.resolveConfigurationHash(root);
    writeFileSync(
      path.join(root, 'config/checkstyle/suppressions.xml'),
      '<suppressions> </suppressions>',
    );

    expect(configured.resolveConfigurationHash(root)).not.toBe(before);
  });

  it('chains the project files into the legacy inventory hash', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      tools,
      legacyInventory: 'nitpicker.legacy.json',
    });
    const root = projectWith({ 'config/pmd/ruleset.xml': '<ruleset/>' });

    const before = configured.resolveConfigurationHash(root);
    writeFileSync(path.join(root, 'config/pmd/ruleset.xml'), '<ruleset name="edited"/>');

    expect(configured.resolveConfigurationHash(root)).not.toBe(before);
  });

  it("uses only nitpicker's configs by default, and the head project's files when opted in", () => {
    const head = projectWith({
      'config/pmd/ruleset.xml': '<ruleset/>',
      'config/checkstyle/checkstyle.xml': '<module/>',
    });

    expect(toolConfigProperties('/base', { policyRoot: head })).toEqual([]);
    expect(
      toolConfigProperties('/base', {
        policyRoot: head,
        toolPrecedence: { pmd: ['nitpicker', 'project'], checkstyle: ['project'] },
      }),
    ).toEqual([
      `-Pnitpicker.pmd.projectConfig=${path.join(head, 'config/pmd/ruleset.xml')}`,
      `-Pnitpicker.checkstyle.projectConfig=${path.join(head, 'config/checkstyle/checkstyle.xml')}`,
      '-Pnitpicker.checkstyle.nitpickerConfig=false',
    ]);
    expect(
      toolConfigProperties('/base', { policyRoot: head, toolPrecedence: { pmd: ['project'] } }),
    ).toEqual([
      `-Pnitpicker.pmd.projectConfig=${path.join(head, 'config/pmd/ruleset.xml')}`,
      '-Pnitpicker.pmd.nitpickerConfig=false',
    ]);
  });

  it('fails with the missing file when the project layer is chosen without one', () => {
    expect(() =>
      toolConfigProperties(projectWith({}), { toolPrecedence: { pmd: ['project'] } }),
    ).toThrow(
      new Error('"tools.pmd.precedence" lists "project" but config/pmd/ruleset.xml is missing'),
    );
  });
});

describe('Java file limits', () => {
  it('hands file-limit thresholds and their exceptions to the runner', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      thresholds: { crapLimit: 12, fileLines: 400, folderFiles: 12 },
      exceptions: [{ rule: 'folder-files-limit', paths: ['src/main/java/icons/**'], reason: 'x' }],
    });

    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));

    expect(parsed.policy.fileLimits).toEqual({ fileLines: 400, folderFiles: 12 });
    expect(parsed.policy.exceptions).toEqual([
      { rule: 'folder-files-limit', glob: 'src/main/java/icons/**' },
    ]);
  });

  it('passes no file limits when the config sets none', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      thresholds: { crapLimit: 12 },
    });
    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));
    expect(parsed.policy.fileLimits).toBeUndefined();
  });

  it('hands the test time budgets to the runner', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      thresholds: { unitTestSeconds: 2, integrationTestSeconds: 40 },
    });

    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));

    expect(parsed.policy.testSeconds).toEqual({ unitTestSeconds: 2, integrationTestSeconds: 40 });
    expect(parsed.policy.fileLimits).toBeUndefined();
  });

  it('rejects file limits that are not a JSON object', () => {
    expect(() => parseRunnerArguments(['--project-root', '/p', '--file-limits', '[]'])).toThrow(
      '--file-limits must be a JSON object',
    );
  });
});

describe('parseRunnerArguments', () => {
  it('rejects unknown options, missing values and a bad CRAP limit', () => {
    expect(() => parseRunnerArguments(['--project-root'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--project-root', '/p', '--nope', 'x'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--snapshot', 'head'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--project-root', '/p', '--crap-limit', '0'])).toThrow(
      /positive number/,
    );
  });

  it('leaves the preset to the caller and accepts the kotlin preset with a formatter', () => {
    expect(parseRunnerArguments(['--project-root', '/p']).policy).toEqual({
      crapLimit: undefined,
      exclude: [],
      exceptions: [],
      legacyInventory: undefined,
      policyRoot: undefined,
      baselineRoot: undefined,
      snapshot: 'head',
      preset: undefined,
      kotlinFormatter: undefined,
      kotlinDetektConfig: undefined,
    });
    expect(
      parseRunnerArguments([
        '--project-root',
        '/p',
        '--preset',
        'kotlin',
        '--kotlin-formatter',
        'none',
        '--kotlin-detekt-config',
        'detekt.yaml',
      ]).policy,
    ).toEqual({
      crapLimit: undefined,
      exclude: [],
      exceptions: [],
      legacyInventory: undefined,
      policyRoot: undefined,
      baselineRoot: undefined,
      snapshot: 'head',
      preset: 'kotlin',
      kotlinFormatter: 'none',
      kotlinDetektConfig: 'detekt.yaml',
    });
  });

  it.each(['nocolon', ':glob/**', 'rule:'])(
    'rejects the exception %s without a rule or a glob',
    (value) => {
      expect(() => parseRunnerArguments(['--project-root', '/p', '--exception', value])).toThrow(
        /Usage/,
      );
    },
  );

  it('keeps a colon inside the glob', () => {
    expect(
      parseRunnerArguments(['--project-root', '/p', '--exception', 'r:a:b/**']).policy.exceptions,
    ).toEqual([{ rule: 'r', glob: 'a:b/**' }]);
  });

  it('rejects an unknown preset or Kotlin formatter', () => {
    expect(() => parseRunnerArguments(['--project-root', '/p', '--preset', 'scala'])).toThrow(
      '--preset must be one of: java, kotlin',
    );
    expect(() =>
      parseRunnerArguments(['--project-root', '/p', '--kotlin-formatter', 'prettier']),
    ).toThrow('--kotlin-formatter must be one of: ktlint, ktfmt, none');
  });
});

describe('applyJavaPolicy', () => {
  it('drops findings under excluded globs only', () => {
    const findings = [finding('src/main/java/gen/A.java'), finding('src/main/java/app/B.java')];

    expect(applyJavaPolicy(findings, { exclude: ['src/main/java/gen/**'] })).toEqual([findings[1]]);
    expect(applyJavaPolicy(findings, {})).toEqual(findings);
  });

  it('drops only the findings of the excepted rule under the excepted globs', () => {
    const at = (file, rule) => ({ ...finding(file), rule });
    const findings = [
      at('src/Main.kt', 'detekt.style.ForbiddenMethodCall'),
      at('src/Other.kt', 'detekt.style.ForbiddenMethodCall'),
      at('src/Main.kt', 'detekt.style.UseDataClass'),
    ];

    expect(
      applyJavaPolicy(findings, {
        exceptions: [{ rule: 'detekt.style.ForbiddenMethodCall', glob: 'src/Main.kt' }],
      }),
    ).toEqual([findings[1], findings[2]]);
  });

  it('lifts a Java finding named as printed, <tool>/<rule>, only under the excepted glob', () => {
    const findings = [
      finding('src/main/java/legacy/A.java'),
      { ...finding('src/main/java/legacy/A.java'), rule: 'Other' },
      finding('src/main/java/app/B.java'),
      { ...finding('src/main/java/legacy/C.java'), tool: 'spotbugs' },
    ];

    expect(
      applyJavaPolicy(findings, {
        exceptions: [{ rule: 'pmd/Rule', glob: 'src/main/java/legacy/**' }],
      }),
    ).toEqual([findings[1], findings[2], findings[3]]);
  });

  it('baselines inventory sites on both snapshots, using the head inventory', () => {
    const headRoot = inventoryRoot([allow('a.java', 1)]);
    const findings = [finding('a.java'), finding('a.java'), finding('b.java')];

    expect(
      applyJavaPolicy(findings, {
        legacyInventory: 'nitpicker.legacy.json',
        policyRoot: headRoot,
        snapshot: 'base',
      }),
    ).toEqual([findings[1], findings[2]]);
  });

  it('reports baseline-expansion on head when the allowance rose over base', () => {
    const headRoot = inventoryRoot([allow('a.java', 3)]);
    const baseRoot = inventoryRoot([allow('a.java', 1)]);
    const options = {
      legacyInventory: 'nitpicker.legacy.json',
      policyRoot: headRoot,
      baselineRoot: baseRoot,
    };

    expect(applyJavaPolicy([], { ...options, snapshot: 'head' })).toEqual([
      {
        tool: 'java',
        rule: 'baseline-expansion',
        path: 'a.java',
        identity: expect.stringMatching(/^site:\w+$/),
        message: 'Legacy allowance increased from 1 to 3 for Rule',
        classification: 'enforceable',
      },
    ]);
    expect(applyJavaPolicy([], { ...options, snapshot: 'base' })).toEqual([]);
    expect(
      applyJavaPolicy([], { ...options, snapshot: 'head', preset: 'kotlin' }).map(
        ({ tool, rule }) => [tool, rule],
      ),
    ).toEqual([['kotlin', 'baseline-expansion']]);
  });

  it('names the tool of a baseline-expansion after the language that asks', () => {
    const options = {
      legacyInventory: 'nitpicker.legacy.json',
      policyRoot: inventoryRoot([allow('a.py', 3)]),
      baselineRoot: inventoryRoot([allow('a.py', 1)]),
      snapshot: 'head',
    };

    expect(applyJavaPolicy([], { ...options, inventoryTool: 'python' })).toEqual([
      {
        tool: 'python',
        rule: 'baseline-expansion',
        path: 'a.py',
        identity: expect.any(String),
        message: 'Legacy allowance increased from 1 to 3 for Rule',
        classification: 'enforceable',
      },
    ]);
  });
});
