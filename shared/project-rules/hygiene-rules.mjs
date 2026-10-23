export const HYGIENE_RULE_IDS = {
  committedEnvFile: 'committed-env-file',
  committedPrivateKey: 'committed-private-key',
  committedBinary: 'committed-binary',
  largeFile: 'large-file',
  committedBuildOutput: 'committed-build-output',
};

export const PACKAGE_RULE_IDS = {
  unusedDependency: 'unused-dependency',
  unlistedDependency: 'unlisted-dependency',
  unresolvedImport: 'unresolved-import',
};

export const HYGIENE_EXCEPTION_RULES = Object.values(HYGIENE_RULE_IDS);
export const PACKAGE_EXCEPTION_RULES = Object.values(PACKAGE_RULE_IDS);

export const LARGE_FILE_BYTES = 1024 * 1024;

const EVERY_LANGUAGE = { typescript: true, java: true, python: true, kotlin: true };
const TYPESCRIPT_ONLY = { typescript: true, java: false, python: false, kotlin: false };

export const HYGIENE_RULES = [
  {
    id: HYGIENE_RULE_IDS.committedEnvFile,
    check: 'repository-hygiene',
    limit: 'a committed `.env` file (templates such as `.env.example` are fine)',
    enforcedBy: EVERY_LANGUAGE,
  },
  {
    id: HYGIENE_RULE_IDS.committedPrivateKey,
    check: 'repository-hygiene',
    limit: 'a committed private key: a key file, or any text file holding a private-key block',
    enforcedBy: EVERY_LANGUAGE,
  },
  {
    id: HYGIENE_RULE_IDS.committedBinary,
    check: 'repository-hygiene',
    limit: 'a committed archive or compiled binary (`gradle-wrapper.jar` is allowed)',
    enforcedBy: EVERY_LANGUAGE,
  },
  {
    id: HYGIENE_RULE_IDS.largeFile,
    check: 'repository-hygiene',
    limit: `a file larger than ${String(LARGE_FILE_BYTES / (1024 * 1024))} MB (lockfiles are exempt)`,
    enforcedBy: EVERY_LANGUAGE,
  },
  {
    id: HYGIENE_RULE_IDS.committedBuildOutput,
    check: 'repository-hygiene',
    limit:
      'a committed build output folder (`dist`, `build`, `out`, `coverage`, `target` next to a project manifest; `.next`, `.nuxt`, `storybook-static`, `.turbo`, `.parcel-cache` anywhere)',
    enforcedBy: EVERY_LANGUAGE,
  },
  {
    id: PACKAGE_RULE_IDS.unusedDependency,
    check: 'dead-code',
    limit: 'a dependency in package.json that nothing imports or runs',
    enforcedBy: TYPESCRIPT_ONLY,
  },
  {
    id: PACKAGE_RULE_IDS.unlistedDependency,
    check: 'dead-code',
    limit: 'an import of a package that package.json does not list',
    enforcedBy: TYPESCRIPT_ONLY,
  },
  {
    id: PACKAGE_RULE_IDS.unresolvedImport,
    check: 'dead-code',
    limit: 'an import that resolves to no file and no package',
    enforcedBy: TYPESCRIPT_ONLY,
  },
];

export const CHANGE_HISTORY_TOOL = 'change-history';

export const HISTORY_RULE_IDS = {
  coChange: 'co-change',
};

export const HISTORY_EXCEPTION_RULES = Object.values(HISTORY_RULE_IDS);

export const CO_CHANGE_DEFAULTS = {
  commits: 300,
  minSupport: 5,
  minConfidence: 0.6,
  maxCommitFiles: 30,
};

export const CO_CHANGE_LIMITS = {
  maxCommits: 2000,
  minHistory: 20,
  minSupport: 2,
  minCommitFiles: 2,
  maxCommitFiles: 100,
};

export const CO_CHANGE_EXAMPLES = 3;

const PERCENT = 100;

export const HISTORY_RULES = [
  {
    id: HISTORY_RULE_IDS.coChange,
    check: CHANGE_HISTORY_TOOL,
    limit: [
      'two folders of production code that changed together in at least',
      `${String(CO_CHANGE_DEFAULTS.minSupport)} of the last ${String(CO_CHANGE_DEFAULTS.commits)} commits`,
      `and in at least ${String(CO_CHANGE_DEFAULTS.minConfidence * PERCENT)}% of the commits of the less-changed one`,
      `(only edits of production code count, and commits of more than ${String(CO_CHANGE_DEFAULTS.maxCommitFiles)} files are ignored);`,
      'opt-in with `history.coChange`, never fails',
    ].join(' '),
    enforcedBy: EVERY_LANGUAGE,
    reportOnly: true,
  },
];
