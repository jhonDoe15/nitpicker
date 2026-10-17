import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createJavaAnalyzer } from './java-analyzer.mjs';
import { JAVA_TOOLS } from './gradle-presets.mjs';
import {
  configureJavaAnalyzer,
  parseJavaRunnerArguments,
  validateJavaConfig,
} from './java-policy.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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
    const parsed = parseJavaRunnerArguments(args.slice(1));

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

  it('hands the size thresholds to the runner', () => {
    const analyzer = createJavaAnalyzer();
    const policyOf = (options) =>
      parseJavaRunnerArguments(
        configureJavaAnalyzer(analyzer, options).createInvocation(context()).args.slice(1),
      ).policy;

    expect(
      policyOf({
        thresholds: { classMethods: 25, classFields: 12, inheritanceDepth: 4, folderDepth: 5 },
      }).fileLimits,
    ).toEqual({ classMethods: 25, classFields: 12, inheritanceDepth: 4, folderDepth: 5 });
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

    const parsed = parseJavaRunnerArguments(configured.createInvocation(context()).args.slice(1));

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

    const parsed = parseJavaRunnerArguments(configured.createInvocation(context()).args.slice(1));

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
      'errorprone',
      'google-java-format',
      'jacoco',
      'palantir-java-format',
      'pit',
      'pmd',
      'spotbugs',
      'spring',
      'structure',
      'test-runtime',
    ]);
  });
});

describe('the duplicate folder list', () => {
  it('reaches the runner, also when it is empty, and changes the hash', () => {
    const analyzer = createJavaAnalyzer();
    const listed = configureJavaAnalyzer(analyzer, { duplicates: { skippedFolders: ['target'] } });
    const empty = configureJavaAnalyzer(analyzer, { duplicates: { skippedFolders: [] } });
    const policyOf = (configured) =>
      parseJavaRunnerArguments(configured.createInvocation(context()).args.slice(1)).policy;

    expect(policyOf(listed).duplicateSkippedFolders).toEqual(['target']);
    expect(policyOf(empty).duplicateSkippedFolders).toEqual([]);
    expect(new Set([analyzer, listed, empty].map((entry) => entry.configurationHash)).size).toBe(3);
    expect(configureJavaAnalyzer(analyzer, { duplicates: {} })).toBe(analyzer);
  });

  it('is left unset without the option and rejected when it is not a list of names', () => {
    expect(
      parseJavaRunnerArguments(['--project-root', '/p']).policy.duplicateSkippedFolders,
    ).toBeUndefined();
    for (const value of ['"build"', '[1]', '{}']) {
      expect(() =>
        parseJavaRunnerArguments(['--project-root', '/p', '--duplicate-skipped-folders', value]),
      ).toThrow('--duplicate-skipped-folders must be a JSON array of folder names');
    }
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

    const parsed = parseJavaRunnerArguments(configured.createInvocation(context()).args.slice(1));
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
});

describe('Java file limits', () => {
  it('hands file-limit thresholds and their exceptions to the runner', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      thresholds: { crapLimit: 12, fileLines: 400, folderFiles: 12 },
      exceptions: [{ rule: 'folder-files-limit', paths: ['src/main/java/icons/**'], reason: 'x' }],
    });

    const parsed = parseJavaRunnerArguments(configured.createInvocation(context()).args.slice(1));

    expect(parsed.policy.fileLimits).toEqual({ fileLines: 400, folderFiles: 12 });
    expect(parsed.policy.exceptions).toEqual([
      { rule: 'folder-files-limit', glob: 'src/main/java/icons/**' },
    ]);
  });

  it('passes no file limits when the config sets none', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      thresholds: { crapLimit: 12 },
    });
    const parsed = parseJavaRunnerArguments(configured.createInvocation(context()).args.slice(1));
    expect(parsed.policy.fileLimits).toBeUndefined();
  });

  it('hands the test time budgets to the runner', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      thresholds: { unitTestSeconds: 2, integrationTestSeconds: 40 },
    });

    const parsed = parseJavaRunnerArguments(configured.createInvocation(context()).args.slice(1));

    expect(parsed.policy.testSeconds).toEqual({ unitTestSeconds: 2, integrationTestSeconds: 40 });
    expect(parsed.policy.fileLimits).toBeUndefined();
  });

  it('rejects file limits that are not a JSON object', () => {
    expect(() => parseJavaRunnerArguments(['--project-root', '/p', '--file-limits', '[]'])).toThrow(
      '--file-limits must be a JSON object',
    );
  });
});

const JAVA_USAGE = new Error(
  'Usage: java-runner.mjs --project-root <directory> [--snapshot base|head] [--policy-root <directory>] [--baseline-root <directory>] [--crap-limit <number>] [--exclude <glob>]... [--exception <rule>:<glob>]... [--legacy-inventory <path>] [--kotlin-detekt-config <path>] [--file-limits <json>] [--test-seconds <json>] [--test-console-allow <json array>] [--duplicate-skipped-folders <json array>] [--preset java|kotlin] [--kotlin-formatter ktlint|ktfmt|none] [--<tool>-precedence <layers>]...',
);

describe('parseJavaRunnerArguments', () => {
  it('rejects unknown options, missing values and a bad CRAP limit', () => {
    expect(() => parseJavaRunnerArguments(['--project-root'])).toThrow(JAVA_USAGE);
    expect(() => parseJavaRunnerArguments(['--project-root', '/p', '--nope', 'x'])).toThrow(
      JAVA_USAGE,
    );
    expect(() => parseJavaRunnerArguments(['--snapshot', 'head'])).toThrow(JAVA_USAGE);
    expect(() => parseJavaRunnerArguments(['--project-root', '/p', '--crap-limit', '0'])).toThrow(
      /positive number/,
    );
  });

  it('leaves the preset to the caller and accepts the kotlin preset with a formatter', () => {
    expect(parseJavaRunnerArguments(['--project-root', '/p']).policy).toEqual({
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
      parseJavaRunnerArguments([
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
      expect(() =>
        parseJavaRunnerArguments(['--project-root', '/p', '--exception', value]),
      ).toThrow(JAVA_USAGE);
    },
  );

  it('keeps a colon inside the glob', () => {
    expect(
      parseJavaRunnerArguments(['--project-root', '/p', '--exception', 'r:a:b/**']).policy
        .exceptions,
    ).toEqual([{ rule: 'r', glob: 'a:b/**' }]);
  });

  it('rejects an unknown preset or Kotlin formatter', () => {
    expect(() => parseJavaRunnerArguments(['--project-root', '/p', '--preset', 'scala'])).toThrow(
      '--preset must be one of: java, kotlin',
    );
    expect(() =>
      parseJavaRunnerArguments(['--project-root', '/p', '--kotlin-formatter', 'prettier']),
    ).toThrow('--kotlin-formatter must be one of: ktlint, ktfmt, none');
  });
});

describe('validateJavaConfig', () => {
  it('asks for the printed name of a Checkstyle check instead of its class', () => {
    const exception = { rule: 'checkstyle/Indentation', paths: ['src/**'], reason: 'Legacy' };
    const byClass = {
      ...exception,
      rule: 'checkstyle/com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck',
    };

    expect(() => {
      validateJavaConfig({ preset: 'java', exceptions: [exception] });
    }).not.toThrow();
    expect(() => {
      validateJavaConfig({ preset: 'java', exceptions: [byClass] });
    }).toThrow(
      `"exceptions[0].rule" names a Checkstyle check by class; findings print the check's name, so write "checkstyle/Indentation"`,
    );
  });
});
