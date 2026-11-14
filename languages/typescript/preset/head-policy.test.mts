import {
  createGitTemplate,
  copyGitTemplate,
} from '../../../core/diff/git/test-support/git-repository.mjs';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { fieldOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import { runQualityDiff } from '../../../core/diff/comparison/run-diff.mts';
import {
  defaultLayout as untypedDefaultLayout,
  prettierPrecedence as untypedPrettierPrecedence,
  readHeadPolicy as untypedReadHeadPolicy,
  readLayout as untypedReadLayout,
  resolveHeadPolicy as untypedResolveHeadPolicy,
  typecheckEngine as untypedTypecheckEngine,
  withHeadPolicyFile as untypedWithHeadPolicyFile,
} from './head-policy.mjs';

type Section = Readonly<Record<string, unknown>>;
type PolicySections = {
  readonly react: Section;
  readonly tools: { readonly prettier: Section };
  readonly duplicates: Section;
  readonly frameworks: Section;
};
type Environment = NodeJS.ProcessEnv;

const defaultLayout: Readonly<Record<string, readonly string[]>> = untypedDefaultLayout;
const resolveHeadPolicy: (config?: object, projectRoot?: string) => PolicySections =
  untypedResolveHeadPolicy;
const withHeadPolicyFile: (policy: object, operation: (policyFile: string) => void) => void =
  untypedWithHeadPolicyFile;
const readHeadPolicy: (environment?: Environment) => PolicySections = untypedReadHeadPolicy;
const readLayout: (environment?: Environment) => {
  readonly entryPoints: readonly string[];
  readonly duplicateSkippedFolders: readonly string[] | undefined;
} = untypedReadLayout;
const prettierPrecedence: (environment?: Environment) => readonly string[] =
  untypedPrettierPrecedence;
const typecheckEngine: (environment?: Environment) => string = untypedTypecheckEngine;

const probeRunnerPath = path.join(
  import.meta.dirname,
  '../../../core/diff/fixtures/policy-probe-runner.mjs',
);
const temporaryRoots: string[] = [];
const libraryOverrides = {
  exclude: ['**/legacy/**'],
  layout: { ...defaultLayout, sourceRoots: ['lib'] },
  thresholds: { crapLimit: 12 },
};

function policyWithDefaults(overrides: object = {}) {
  return {
    exclude: [],
    layout: defaultLayout,
    exceptions: [],
    thresholds: {},
    react: {},
    i18n: {},
    tools: {},
    duplicates: {},
    testConsole: {},
    generatedFiles: [],
    frameworks: { defaultExports: [], entryPoints: [] },
    history: {},
    ...overrides,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('head policy react key', () => {
  it('is left out of the policy until the config sets it', () => {
    expect(Object.keys(resolveHeadPolicy({}))).toEqual([
      'exclude',
      'layout',
      'exceptions',
      'thresholds',
    ]);
  });

  it('carries the react setting to the readers of the policy file', () => {
    const policy = resolveHeadPolicy({ react: { enabled: false, styling: 'css-in-js' } });

    expect(policy.react).toEqual({ enabled: false, styling: 'css-in-js' });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile }).react).toEqual({
        enabled: false,
        styling: 'css-in-js',
      });
    });
  });
});

describe('head policy icon package', () => {
  function projectWith(dependencies: Readonly<Record<string, string>>) {
    const root = temporaryDirectory();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
    return root;
  }

  it('records the first icon package of the head checkout next to the React scope', () => {
    const root = projectWith({ react: '19.0.0', 'react-icons': '5.0.0', 'lucide-react': '1.0.0' });

    expect(resolveHeadPolicy({}, root).react).toEqual({
      enabled: true,
      iconPackage: 'react-icons',
      major: 19,
      styling: 'class-names',
      autoCleanup: true,
    });
  });

  it('leaves the key out when the head checkout has no icon package', () => {
    const root = projectWith({ react: '19.0.0' });

    expect(resolveHeadPolicy({}, root).react).toEqual({
      enabled: true,
      major: 19,
      styling: 'class-names',
      autoCleanup: true,
    });
  });
});

describe('head policy React major version', () => {
  function projectWith(dependencies: Readonly<Record<string, string>>) {
    const root = temporaryDirectory();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies }));
    return root;
  }

  it('records the installed major of the head checkout over its declared range', () => {
    const root = projectWith({ react: '^19.0.0' });
    mkdirSync(path.join(root, 'node_modules/react'), { recursive: true });
    writeFileSync(
      path.join(root, 'node_modules/react/package.json'),
      JSON.stringify({ version: '18.3.1' }),
    );

    expect(resolveHeadPolicy({}, root).react['major']).toBe(18);
  });

  it('leaves the major out when React is off or its version is unreadable', () => {
    expect(resolveHeadPolicy({}, projectWith({})).react).toEqual({ enabled: false });
    expect(resolveHeadPolicy({}, projectWith({ react: 'latest' })).react).toEqual({
      enabled: true,
      styling: 'class-names',
      autoCleanup: true,
    });
  });
});

describe('head policy styling approach', () => {
  function stylingOf(
    manifest: object,
    files: Readonly<Record<string, string>>,
    config: object = {},
  ) {
    const root = temporaryDirectory();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    return resolveHeadPolicy(config, root).react['styling'];
  }

  const cssModules =
    "import styles from './card.module.css';\nexport const C = () => <p className={styles.c} />;\n";
  const styled =
    "import styled from '@emotion/styled';\nexport const Box = styled.div`color: red;`;\n";
  const muiAndEmotion = {
    dependencies: { react: '19.0.0', '@mui/material': '7.0.0', '@emotion/react': '11.0.0' },
  };

  it('follows what most head source files use, not which libraries are installed', () => {
    const files = {
      'src/a.tsx': cssModules,
      'src/b.tsx': cssModules,
      'src/c.tsx': styled,
      'src/a.test.tsx': styled,
      'src/d.test.tsx': styled,
    };

    expect(stylingOf(muiAndEmotion, files)).toBe('class-names');
    expect(
      stylingOf(muiAndEmotion, {
        'src/a.tsx': styled,
        'src/b.tsx': cssModules,
        'src/c.tsx': styled,
      }),
    ).toBe('css-in-js');
  });

  it('falls back to the dependencies without styled source and lets the config decide', () => {
    expect(stylingOf(muiAndEmotion, {})).toBe('css-in-js');
    expect(stylingOf({ dependencies: { react: '19.0.0', expo: '54.0.0' } }, {})).toBe(
      'style-sheet',
    );
    expect(
      stylingOf(muiAndEmotion, { 'src/a.tsx': styled }, { react: { styling: 'inline-style' } }),
    ).toBe('inline-style');
  });
});

describe('head policy test cleanup', () => {
  function autoCleanupOf(
    devDependencies: Readonly<Record<string, string>>,
    config: string | undefined,
  ) {
    const root = temporaryDirectory();
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { react: '19.0.0' }, devDependencies }),
    );
    if (config !== undefined) writeFileSync(path.join(root, 'vitest.config.ts'), config);
    return resolveHeadPolicy({}, root).react['autoCleanup'];
  }

  it('records whether Testing Library unmounts after each test without a setup call', () => {
    const vitest = { vitest: '4.0.0' };

    expect(autoCleanupOf(vitest, 'export default { test: { environment: "jsdom" } };')).toBe(false);
    expect(autoCleanupOf(vitest, 'export default { test: { globals: false } };')).toBe(false);
    expect(autoCleanupOf(vitest, undefined)).toBe(false);
    expect(autoCleanupOf(vitest, 'export default { test: { globals: true } };')).toBe(true);
    expect(autoCleanupOf({ jest: '30.0.0' }, undefined)).toBe(true);
  });
});

describe('head policy framework conventions', () => {
  function projectWith(manifest: object, files: Readonly<Record<string, string>> = {}) {
    const root = temporaryDirectory();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    return resolveHeadPolicy({}, root).frameworks;
  }

  const nextFiles = [
    '{app,src/app}/**/{page,layout,loading,error,global-error,not-found,template,default,route,forbidden,unauthorized,sitemap,robots,manifest,icon,apple-icon,opengraph-image,twitter-image}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    '{pages,src/pages}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    '{middleware,src/middleware,proxy,src/proxy}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  ];
  const reactRouterFiles = [
    'app/{root,routes,entry.client,entry.server}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    'app/routes/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  ];
  const storyFiles = ['**/*.{stories,story}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
  const expoFiles = ['{app,src/app}/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

  it.each([
    ['Next.js from its dependency', { dependencies: { next: '15.0.0' } }, {}, nextFiles],
    ['Next.js from its config file', {}, { 'next.config.mjs': 'export default {};' }, nextFiles],
    [
      'Storybook from a package',
      { devDependencies: { '@storybook/react': '9.0.0' } },
      {},
      storyFiles,
    ],
    ['Storybook from its folder', {}, { '.storybook/main.ts': 'export default {};' }, storyFiles],
    ['Expo Router', { dependencies: { 'expo-router': '6.0.0' } }, {}, expoFiles],
    [
      'React Router from its dev package',
      { devDependencies: { '@react-router/dev': '7.9.0' } },
      {},
      reactRouterFiles,
    ],
    ['Remix', { dependencies: { '@remix-run/react': '2.0.0' } }, {}, reactRouterFiles],
    [
      'React Router from its config file',
      {},
      { 'react-router.config.ts': 'export default {};' },
      reactRouterFiles,
    ],
  ])('allows the default exports of %s', (_name, manifest, files, defaultExports) => {
    expect(projectWith(manifest, files)).toEqual({ defaultExports, entryPoints: [] });
  });

  it.each([
    [
      'the module script of index.html',
      {
        'index.html':
          '<script src="/src/boot.tsx?v=1" type="module"></script><script src="/x.js"></script>',
      },
      ['src/boot.tsx'],
    ],
    ['the conventional src/main.tsx', { 'src/main.tsx': 'export {};' }, ['src/main.tsx']],
    ['no entry it can find', {}, []],
  ])('takes the Vite entry from %s', (_name, files, entryPoints) => {
    const frameworks = projectWith({ devDependencies: { vite: '7.0.0' } }, files);

    expect(frameworks).toEqual(
      entryPoints.length === 0 ? undefined : { defaultExports: [], entryPoints },
    );
  });

  it('records nothing for a project without those frameworks', () => {
    expect(projectWith({ dependencies: { react: '19.0.0' } }, { 'src/main.tsx': '' })).toBe(
      undefined,
    );
  });
});

describe('head policy reader', () => {
  it('falls back to preset layout defaults without a policy file', () => {
    expect(readHeadPolicy({})).toEqual(policyWithDefaults());
  });

  it('merges the head policy over the defaults', () => {
    const policy = resolveHeadPolicy({
      exclude: ['**/legacy/**'],
      layout: { sourceRoots: ['lib'] },
      thresholds: { crapLimit: 12 },
    });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile })).toEqual(
        policyWithDefaults(libraryOverrides),
      );
    });
  });

  it('reads the Prettier precedence, defaulting to the nitpicker config alone', () => {
    expect(prettierPrecedence({})).toEqual(['nitpicker']);
    const policy = resolveHeadPolicy({
      tools: { prettier: { precedence: ['project', 'nitpicker'] } },
    });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(prettierPrecedence({ NITPICKER_POLICY: policyFile })).toEqual([
        'project',
        'nitpicker',
      ]);
    });
  });

  it('reads the type check engine, defaulting to TypeScript 7', () => {
    expect(typecheckEngine({})).toBe('native');
    const policy = resolveHeadPolicy({ tools: { typescript: { engine: 'project' } } });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(typecheckEngine({ NITPICKER_POLICY: policyFile })).toBe('project');
    });
  });

  it('fingerprints the project Prettier config only when the project layer is used', () => {
    const root = temporaryDirectory();
    writeFileSync(path.join(root, '.prettierrc'), '{ "semi": false }\n');
    const projectConfig = { tools: { prettier: { precedence: ['project'] } } };
    const nitpickerOnly = { tools: { prettier: { precedence: ['nitpicker'] } } };
    const before = resolveHeadPolicy(projectConfig, root).tools.prettier['projectConfigDigest'];
    expect(resolveHeadPolicy(nitpickerOnly, root).tools.prettier).toEqual({
      precedence: ['nitpicker'],
    });
    writeFileSync(path.join(root, '.prettierrc'), '{ "semi": true }\n');
    expect(resolveHeadPolicy(projectConfig, root).tools.prettier['projectConfigDigest']).not.toBe(
      before,
    );
    expect(resolveHeadPolicy({}, root)).not.toHaveProperty('tools');
  });

  it('exposes the configured entry points on the resolved layout', () => {
    const policy = resolveHeadPolicy({ layout: { entryPoints: ['tools/*-runner.mjs'] } });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readLayout({ NITPICKER_POLICY: policyFile }).entryPoints).toEqual([
        'tools/*-runner.mjs',
      ]);
    });
    expect(readLayout({}).entryPoints).toEqual([]);
  });

  it('fails instead of weakening the policy when the file is unreadable or malformed', () => {
    expect(() => readHeadPolicy({ NITPICKER_POLICY: '/nonexistent/policy.json' })).toThrow(
      /policy\.json/,
    );
    const root = temporaryDirectory();
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, '{not-json');
    expect(() => readHeadPolicy({ NITPICKER_POLICY: policyFile })).toThrow(/not valid JSON/);
  });

  it('removes the policy file after the operation', () => {
    let seen: string | undefined;
    withHeadPolicyFile({}, (policyFile) => {
      seen = policyFile;
      expect(existsSync(policyFile)).toBe(true);
    });
    expect(existsSync(String(seen))).toBe(false);
  });
});

describe('head policy delivery', () => {
  let gitTemplateRoot: string;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  it('shows the head policy to a runner child process on both the base and head runs', () => {
    const root = realpathSync(temporaryDirectory());
    const logPath = path.join(root, 'probe.log');
    const repository = path.join(root, 'repo');
    mkdirSync(repository);
    copyGitTemplate(gitTemplateRoot, repository);
    git(repository, ['config', 'user.name', 'Policy Fixture']);
    git(repository, ['config', 'user.email', 'policy@example.invalid']);
    writeFileSync(path.join(repository, 'a.txt'), 'base\n');
    git(repository, ['add', '-A']);
    git(repository, ['commit', '-q', '-m', 'base']);
    git(repository, ['branch', 'comparison-base']);
    writeFileSync(path.join(repository, 'a.txt'), 'head\n');
    git(repository, ['add', '-A']);
    git(repository, ['commit', '-q', '-m', 'head']);

    const policyProbe = {
      name: 'policy-probe',
      version: '1.0.0',
      configurationHash: 'probe',
      exclusions: [],
      createInvocation: (context: unknown) => {
        const projectRoot = textOf(fieldOf(context, 'projectRoot'));
        return {
          command: process.execPath,
          args: [probeRunnerPath, projectRoot, logPath],
          cwd: projectRoot,
        };
      },
    };

    runQualityDiff({
      repositoryRoot: repository,
      projectRelativePath: '.',
      headProjectRoot: repository,
      requestedBaseRef: 'comparison-base',
      outputRoot: path.join(root, 'out'),
      headPolicy: resolveHeadPolicy({
        exclude: ['**/legacy/**'],
        layout: { sourceRoots: ['lib'] },
        thresholds: { crapLimit: 12 },
      }),
      analyzers: [policyProbe],
    });

    const runs = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => parseJson(line));
    expect(runs).toHaveLength(2);
    expect(new Set(runs.map((run) => fieldOf(run, 'root'))).size).toBe(2);
    expect(runs.map((run) => fieldOf(run, 'policy'))).toEqual(
      runs.map(() => policyWithDefaults(libraryOverrides)),
    );
  });
});

function temporaryDirectory() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-head-policy-test-'));
  temporaryRoots.push(root);
  return root;
}

const gitFixtureEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

function git(cwd: string, arguments_: string[]) {
  return execFileSync('git', arguments_, {
    cwd,
    encoding: 'utf8',
    env: gitFixtureEnvironment,
    timeout: 10_000,
  });
}

describe('head policy duplicates key', () => {
  it('is left out of the policy until the config sets it and read back as an empty object', () => {
    expect(resolveHeadPolicy({})).toEqual({
      exclude: [],
      layout: {},
      exceptions: [],
      thresholds: {},
    });
    withHeadPolicyFile(resolveHeadPolicy({}), (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile }).duplicates).toEqual({});
      expect(readLayout({ NITPICKER_POLICY: policyFile }).duplicateSkippedFolders).toBeUndefined();
    });
  });

  it('carries the skipped folders to the readers of the policy file and the layout', () => {
    const policy = resolveHeadPolicy({ duplicates: { skippedFolders: ['dist'] } });

    expect(policy.duplicates).toEqual({ skippedFolders: ['dist'] });
    withHeadPolicyFile(policy, (policyFile) => {
      expect(readHeadPolicy({ NITPICKER_POLICY: policyFile }).duplicates).toEqual({
        skippedFolders: ['dist'],
      });
      expect(readLayout({ NITPICKER_POLICY: policyFile }).duplicateSkippedFolders).toEqual([
        'dist',
      ]);
    });
  });
});
