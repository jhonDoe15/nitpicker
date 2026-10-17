import { describe, expect, it } from 'vitest';
import { applyDisable, describeConfigOverrides } from './config.mjs';
import { validateConfig } from './validate.mjs';
import { policyHash } from '../diff/reporting/report-model.mjs';

describe('config file', () => {
  it('accepts an empty config and the documented keys', () => {
    expect(validateConfig({})).toEqual({});
    expect(
      validateConfig({
        base: 'origin/develop',
        preset: 'typescript',
        disable: ['knip'],
        thresholds: { crapLimit: 12 },
        exclude: ['generated/**'],
        layout: { sourceRoots: ['lib'], testRoots: ['spec', 'tests'] },
        analyzers: [{ name: 'custom', command: './check.sh', args: ['--json'] }],
      }),
    ).toBeDefined();
  });

  it('accepts the java, kotlin and python presets and rejects other presets', () => {
    expect(validateConfig({ preset: 'java' })).toEqual({ preset: 'java' });
    expect(validateConfig({ preset: 'kotlin' })).toEqual({ preset: 'kotlin' });
    expect(validateConfig({ preset: 'python' })).toEqual({ preset: 'python' });
    expect(() => validateConfig({ preset: 'cobol' })).toThrow(
      '"preset" must be one of: typescript, javascript, java, kotlin, python',
    );
  });

  it('accepts python settings only with the python preset', () => {
    const python = { environment: 'uv', formatter: 'black', sourceRoots: ['src'] };
    expect(validateConfig({ preset: 'python', python })).toEqual({ preset: 'python', python });
    expect(() => validateConfig({ preset: 'python', python: { formatter: 'x' } })).toThrow(
      '"python.formatter" must be one of',
    );
    expect(() => validateConfig({ preset: 'java', python })).toThrow(
      '"python" is only supported with "preset": "python"',
    );
    expect(describeConfigOverrides({ preset: 'python', python })).toEqual([
      'preset: "python"',
      `python: ${JSON.stringify(python)}`,
    ]);
  });

  it('lists each python exception separately in the config overrides', () => {
    const exception = { rule: 'T201', paths: ['scripts/**'], reason: 'command line scripts' };

    expect(
      describeConfigOverrides({
        python: { typeChecker: 'mypy', exceptions: [exception, { ...exception, rule: 'B006' }] },
      }),
    ).toEqual([
      'python: {"typeChecker":"mypy"}',
      `exception: ${JSON.stringify(exception)}`,
      `exception: ${JSON.stringify({ ...exception, rule: 'B006' })}`,
    ]);
    expect(describeConfigOverrides({ python: { exceptions: [exception] } })).toEqual([
      `exception: ${JSON.stringify(exception)}`,
    ]);
  });

  it('shares thresholds, exclude, legacyInventory and file-limit exceptions with the python preset', () => {
    const shared = {
      thresholds: { crapLimit: 12 },
      exclude: ['generated/**'],
      legacyInventory: 'config/legacy.json',
    };
    expect(validateConfig({ preset: 'python', ...shared })).toEqual({
      preset: 'python',
      ...shared,
    });
    expect(() => validateConfig({ preset: 'python', layout: {} })).toThrow(
      '"layout" is not supported with "preset": "python"',
    );
    const exceptions = [{ rule: 'line-length-limit', paths: ['src/urls.py'], reason: 'URL table' }];
    expect(validateConfig({ preset: 'python', exceptions })).toEqual({
      preset: 'python',
      exceptions,
    });
    expect(() =>
      validateConfig({
        preset: 'python',
        exceptions: [{ rule: 'nitpicker/no-throw', paths: ['src/**'], reason: 'Legacy' }],
      }),
    ).toThrow('"exceptions" is not supported with "preset": "python"');
  });

  describe('kotlin options', () => {
    it.each([
      { formatter: 'ktfmt' },
      { formatter: 'none' },
      { detektConfig: 'tools/detekt-rules.yml' },
      {},
    ])('accepts %j with the kotlin preset', (kotlin) => {
      const config = { preset: 'kotlin', kotlin };
      expect(validateConfig(config)).toEqual(config);
    });

    it.each([
      [
        { preset: 'kotlin', kotlin: { formatter: 'prettier' } },
        /must be one of: ktlint, ktfmt, none/,
      ],
      [{ preset: 'kotlin', kotlin: { style: 'google' } }, /unknown key "kotlin.style"/],
      [
        { preset: 'kotlin', kotlin: { detektConfig: '/etc/detekt.yml' } },
        /"kotlin.detektConfig" must be a path inside the project/,
      ],
      [
        { preset: 'kotlin', kotlin: { detektConfig: '../detekt.yml' } },
        /"kotlin.detektConfig" must be a path inside the project/,
      ],
      [
        { preset: 'kotlin', kotlin: { detektConfig: '' } },
        /"kotlin.detektConfig" must be a non-empty string/,
      ],
      [{ preset: 'kotlin', kotlin: 'ktlint' }, /"kotlin" must be an object/],
      [
        { preset: 'java', kotlin: { formatter: 'ktlint' } },
        /only supported with "preset": "kotlin"/,
      ],
      [{ kotlin: { formatter: 'ktlint' } }, /only supported with "preset": "kotlin"/],
    ])('rejects %j', (config, message) => {
      expect(() => validateConfig(config)).toThrow(message);
    });
  });

  it('accepts the javascript preset with the TypeScript-pipeline keys', () => {
    const config = {
      preset: 'javascript',
      layout: { sourceRoots: ['lib'] },
      exceptions: [{ rule: 'nitpicker/no-throw', paths: ['lib/**'], reason: 'A reviewed reason.' }],
      tools: { prettier: { precedence: ['project'] } },
    };
    expect(validateConfig(config)).toEqual(config);
  });

  describe('kotlin exceptions', () => {
    const exception = {
      rule: 'detekt.style.ForbiddenMethodCall',
      paths: ['src/main/kotlin/app/Main.kt'],
      reason: 'The entry point blocks on its coroutine.',
    };

    it('accepts an exception for a one-way rule with the TypeScript shape', () => {
      expect(validateConfig({ preset: 'kotlin', exceptions: [exception] })).toEqual({
        preset: 'kotlin',
        exceptions: [exception],
      });
    });

    it('accepts an exception for a file limit or a slow test and leaves line length to detekt', () => {
      const fileLimit = { ...exception, rule: 'folder-files-limit' };
      const lineLength = { ...exception, rule: 'line-length-limit' };
      const slowTest = { ...exception, rule: 'test-runtime/slow-test' };
      const config = { preset: 'kotlin', thresholds: { unitTestSeconds: 2.5 } };
      expect(validateConfig({ ...config, exceptions: [fileLimit, lineLength, slowTest] })).toEqual({
        ...config,
        exceptions: [fileLimit, lineLength, slowTest],
      });
      expect(() => validateConfig({ preset: 'kotlin', thresholds: { lineLength: 140 } })).toThrow(
        'detekt checks Kotlin line length',
      );
    });

    it('names the rules that can be lifted when the rule is another detekt rule', () => {
      const other = { ...exception, rule: 'detekt.style.MagicNumber' };

      expect(() => validateConfig({ preset: 'kotlin', exceptions: [other] })).toThrow(
        /"exceptions\[0\]\.rule" is "detekt\.style\.MagicNumber".*detekt\.style\.ForbiddenMethodCall.*config\/detekt\/detekt\.yml/,
      );
    });
  });

  it('shares thresholds, exclude and legacyInventory between presets', () => {
    const shared = {
      thresholds: { crapLimit: 12 },
      exclude: ['src/main/java/generated/**'],
      legacyInventory: 'config/legacy.json',
    };
    expect(validateConfig({ preset: 'java', ...shared })).toEqual({ preset: 'java', ...shared });
    expect(validateConfig({ preset: 'typescript', ...shared })).toBeDefined();
    expect(() => validateConfig({ preset: 'java', thresholds: { crapLimit: 0 } })).toThrow(
      /positive number/,
    );
    expect(() => validateConfig({ preset: 'python', thresholds: { unitTestSeconds: 2 } })).toThrow(
      '"thresholds.unitTestSeconds" is supported only with "preset": "java" or "kotlin"',
    );
    expect(() => validateConfig({ preset: 'java', legacyInventory: '../x.json' })).toThrow(
      /inside the project/,
    );
  });

  it('accepts exceptions with the java preset when they name a printed Java rule', () => {
    const exceptions = [
      { rule: 'pmd/SpringConstructorInjection', paths: ['src/main/**'], reason: 'Legacy wiring' },
    ];
    expect(validateConfig({ preset: 'java', exceptions })).toEqual({ preset: 'java', exceptions });
    for (const rule of [
      'SpringConstructorInjection',
      'eslint/no-var',
      'pmd/',
      'java/gradle-failure',
    ]) {
      expect(() =>
        validateConfig({ preset: 'java', exceptions: [{ ...exceptions[0], rule }] }),
      ).toThrow('"exceptions[0].rule" must name a finding as it is printed');
    }
  });

  it.each([
    ['java', 'layout'],
    ['java', 'react'],
    ['kotlin', 'layout'],
    ['kotlin', 'react'],
  ])('rejects the %s preset with %s instead of ignoring it', (preset, key) => {
    expect(() => validateConfig({ preset, [key]: {} })).toThrow(
      `"${key}" is not supported with "preset": "${preset}"`,
    );
  });

  it('lets the java preset lift the shared file limits, but not line length or ESLint rules', () => {
    const exceptions = [
      {
        rule: 'folder-files-limit',
        paths: ['src/main/java/icons/**'],
        reason: 'One class per icon',
      },
    ];
    const config = { preset: 'java', thresholds: { fileLines: 400, folderFiles: 12 }, exceptions };
    expect(validateConfig(config)).toEqual(config);
    expect(() =>
      validateConfig({
        preset: 'java',
        exceptions: [{ rule: 'nitpicker/no-throw', paths: ['src/**'], reason: 'Legacy' }],
      }),
    ).toThrow('"exceptions[0].rule" must name a finding as it is printed');
    const longNames = {
      rule: 'line-length-limit',
      paths: ['src/**'],
      reason: 'Long names',
    };
    expect(validateConfig({ preset: 'java', exceptions: [longNames] }).exceptions).toEqual([
      longNames,
    ]);
    expect(() => validateConfig({ preset: 'java', thresholds: { lineLength: 140 } })).toThrow(
      new Error(
        'nitpicker.config.json: "thresholds.lineLength" is not supported with "preset": "java": Java keeps 100 characters per line, where google-java-format wraps; lift the rule for some paths with an exception for "line-length-limit"',
      ),
    );
  });

  it.each([
    [[], /must be a JSON object/],
    [{ thresholds: { folderFiles: 2.5 } }, /"thresholds.folderFiles" must be a whole number/],
    [{ thresholds: { lineLength: 0 } }, /"thresholds.lineLength" must be a positive number/],
    [{ disable: 'knip' }, /"disable" must be an array/],
    [{ disable: ['a', 'a'] }, /duplicates/],
    [{ thresholds: { crapLimit: 0 } }, /positive number/],
    [{ exclude: [1] }, /"exclude" must be an array/],
    [{ layout: [] }, /"layout" must be an object/],
    [{ layout: { source: ['lib'] } }, /unknown layout key "source"/],
    [{ layout: { sourceRoots: 'lib' } }, /"layout.sourceRoots" must be an array/],
    [{ layout: { sourceRoots: [] } }, /"layout.sourceRoots" must not be empty/],
    [{ layout: { testRoots: ['../spec'] } }, /entries must be directories inside the project/],
    [{ layout: { sourceRoots: ['/abs'] } }, /entries must be directories inside the project/],
    [{ layout: { sourceRoots: ['lib/**'] } }, /entries must be directories inside the project/],
    [{ analyzers: [{ name: 'a', command: 'b', extra: 1 }] }, /unknown key "extra"/],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it('describes overrides in a stable key order', () => {
    expect(describeConfigOverrides({ thresholds: { crapLimit: 12 }, base: 'main' })).toEqual([
      'base: "main"',
      'thresholds: {"crapLimit":12}',
    ]);
  });

  it('refuses to disable an analyzer that another enabled analyzer depends on', () => {
    const analyzers = [{ name: 'coverage' }, { name: 'crap', dependencies: ['coverage'] }];

    expect(() => applyDisable(analyzers, { disable: ['coverage'] })).toThrow(/depends on it/);
    expect(applyDisable(analyzers, { disable: ['coverage', 'crap'] })).toEqual([]);
  });

  it('keeps the zero-config policy hash and changes it for any override', () => {
    const analyzers = [{ name: 'a', version: '1', configurationHash: 'h' }];

    expect(policyHash(analyzers, [])).toBe(policyHash(analyzers));
    expect(policyHash(analyzers, ['base: "x"'])).not.toBe(policyHash(analyzers));
  });
});

describe('tool precedence', () => {
  it('accepts every ordering of the project and nitpicker configs', () => {
    for (const precedence of [
      ['nitpicker'],
      ['project'],
      ['project', 'nitpicker'],
      ['nitpicker', 'project'],
    ]) {
      expect(validateConfig({ tools: { prettier: { precedence } } })).toBeDefined();
    }
  });

  it('rejects unknown tools, unknown keys and malformed precedence lists', () => {
    expect(() => validateConfig({ tools: { stylelint: { precedence: ['project'] } } })).toThrow(
      '"tools" names unknown tool "stylelint". Supported tools with this preset: prettier, eslint, typescript, tests',
    );
    expect(() => validateConfig({ tools: { prettier: { config: 'project' } } })).toThrow(
      '"tools.prettier" has unknown key "config"',
    );
    for (const precedence of [[], ['project', 'project'], ['workspace'], 'project', undefined]) {
      expect(() => validateConfig({ tools: { prettier: { precedence } } })).toThrow(
        new Error(
          'nitpicker.config.json: "tools.prettier.precedence" must list "project", "nitpicker" or both, each once, highest first',
        ),
      );
    }
    expect(() => validateConfig({ preset: 'java', tools: { pmd: { precedence: [] } } })).toThrow(
      new Error(
        'nitpicker.config.json: "tools.pmd.precedence" must list "project", "nitpicker" or both, each once',
      ),
    );
    expect(() => validateConfig({ tools: [] })).toThrow('"tools" must be an object');
  });

  it('lists the tools setting among the config overrides', () => {
    const tools = { prettier: { precedence: ['project', 'nitpicker'] } };
    expect(describeConfigOverrides({ tools })).toEqual([`tools: ${JSON.stringify(tools)}`]);
  });

  it.each(['java', 'kotlin'])(
    'names PMD and Checkstyle with the %s preset, where Checkstyle runs one config',
    (preset) => {
      const tools = {
        pmd: { precedence: ['project', 'nitpicker'] },
        checkstyle: { precedence: ['project'] },
      };
      expect(validateConfig({ preset, tools })).toEqual({ preset, tools });
      expect(() =>
        validateConfig({ preset, tools: { prettier: { precedence: ['project'] } } }),
      ).toThrow(
        '"tools" names unknown tool "prettier". Supported tools with this preset: pmd, checkstyle',
      );
      expect(() =>
        validateConfig({ preset, tools: { checkstyle: { precedence: ['nitpicker', 'project'] } } }),
      ).toThrow('"tools.checkstyle.precedence" must be ["nitpicker"] or ["project"]');
    },
  );

  it('keeps PMD and Checkstyle out of the TypeScript and Python presets', () => {
    const tools = { pmd: { precedence: ['project'] } };
    expect(() => validateConfig({ tools })).toThrow(
      new Error(
        'nitpicker.config.json: "tools" names unknown tool "pmd". Supported tools with this preset: prettier, eslint, typescript, tests',
      ),
    );
    expect(() => validateConfig({ preset: 'python', tools })).toThrow(
      new Error(
        'nitpicker.config.json: "tools" is not supported with "preset": "python": it describes the TypeScript source layout and ESLint rules, which the Python preset does not have. Not supported with python: layout, exceptions, react, i18n, tools, except exceptions for file-lines-limit, line-length-limit, folder-files-limit. Shared by all presets: thresholds, exclude, legacyInventory',
      ),
    );
  });
});

describe('strict exceptions', () => {
  const exception = {
    rule: 'nitpicker/preserve-error-cause',
    paths: ['src/legacy/**'],
    reason: 'Legacy module rewrites errors on purpose until the migration lands',
  };

  it('accepts an exception and a layout override', () => {
    expect(
      validateConfig({ exceptions: [exception], layout: { sourceRoots: ['lib'] } }),
    ).toBeDefined();
  });

  it.each([
    [{ exceptions: exception }, /"exceptions" must be an array/],
    [{ exceptions: [{ ...exception, reason: undefined }] }, /reason" is required/],
    [{ exceptions: [{ ...exception, reason: '  ' }] }, /reason" is required/],
    [{ exceptions: [{ ...exception, paths: [] }] }, /at least one path glob/],
    [{ exceptions: [{ ...exception, paths: 'src/**' }] }, /paths" must be an array/],
    [{ exceptions: [{ ...exception, rule: '' }] }, /rule" must be a non-empty rule id/],
    [{ exceptions: [{ ...exception, extra: 1 }] }, /unknown key "extra"/],
    [{ layout: { sourceRoot: ['lib'] } }, /unknown layout key "sourceRoot"/],
    [{ layout: { sourceRoots: 'lib' } }, /"layout.sourceRoots" must be an array/],
  ])('rejects %j', (config, message) => {
    expect(() => validateConfig(config)).toThrow(message);
  });

  it('reports each exception and layout override and changes the policy hash', () => {
    const plain = describeConfigOverrides({});
    const withException = describeConfigOverrides({ exceptions: [exception] });
    const withLayout = describeConfigOverrides({ layout: { sourceRoots: ['lib'] } });
    expect(withException).toEqual([`exception: ${JSON.stringify(exception)}`]);
    expect(withLayout).toEqual(['layout: {"sourceRoots":["lib"]}']);
    const hashes = [plain, withException, withLayout].map((overrides) => policyHash([], overrides));
    expect(new Set(hashes).size).toBe(3);
  });
});

describe('layout keys', () => {
  it('accepts entry point globs for files that are loaded by path', () => {
    const layout = { entryPoints: ['tools/*-runner.mjs'] };

    expect(validateConfig({ layout })).toEqual({ layout });
  });

  it('accepts the directory roots and the excluded globs together', () => {
    const layout = {
      sourceRoots: ['lib'],
      testRoots: ['spec'],
      excludedGlobs: ['**/vendor/**', '**/*.generated.ts'],
    };

    expect(validateConfig({ layout })).toEqual({ layout });
  });

  it('validates globs for excludedGlobs and directories for the roots', () => {
    expect(() => validateConfig({ layout: { excludedGlobs: ['**/vendor/**'] } })).not.toThrow();
    expect(() => validateConfig({ layout: { sourceRoots: ['**/vendor/**'] } })).toThrow(
      /entries must be directories inside the project/,
    );
    expect(() => validateConfig({ layout: { excludedGlobs: '**/vendor/**' } })).toThrow(
      /"layout.excludedGlobs" must be an array/,
    );
    expect(() => validateConfig({ layout: { excludedGlobs: [''] } })).toThrow(
      /"layout.excludedGlobs" must be an array of non-empty strings/,
    );
  });

  it('lists every allowed layout key when one is unknown', () => {
    expect(() => validateConfig({ layout: { roots: ['lib'] } })).toThrow(
      /Allowed layout keys: sourceRoots, testRoots, excludedGlobs/,
    );
  });
});

describe('react keys', () => {
  it('accepts enabled and every styling approach', () => {
    for (const react of [
      {},
      { enabled: true },
      { enabled: false },
      { styling: 'class-names' },
      { styling: 'css-in-js' },
      { styling: 'inline-style' },
      { enabled: true, styling: 'css-in-js' },
    ]) {
      expect(validateConfig({ react })).toEqual({ react });
    }
  });

  it.each([
    [[], /"react" must be an object/],
    ['react', /"react" must be an object/],
    [{ enable: true }, /unknown react key "enable". Allowed react keys: enabled, styling/],
    [{ enabled: 'yes' }, /"react.enabled" must be true or false/],
    [{ enabled: 1 }, /"react.enabled" must be true or false/],
    [
      { styling: 'tailwind' },
      /"react.styling" must be one of: class-names, css-in-js, inline-style/,
    ],
  ])('rejects react %j', (react, message) => {
    expect(() => validateConfig({ react })).toThrow(message);
  });

  it('reports the react override and changes the policy hash', () => {
    const overrides = describeConfigOverrides({ react: { styling: 'css-in-js' } });
    const analyzers = [{ name: 'a', version: '1', configurationHash: 'h' }];

    expect(overrides).toEqual(['react: {"styling":"css-in-js"}']);
    expect(policyHash(analyzers, overrides)).not.toBe(policyHash(analyzers, []));
  });
});
