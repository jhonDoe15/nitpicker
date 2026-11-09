export const HYGIENE_RULE_IDS = {
  committedEnvFile: 'committed-env-file',
  committedPrivateKey: 'committed-private-key',
  committedBinary: 'committed-binary',
  largeFile: 'large-file',
  committedBuildOutput: 'committed-build-output',
  migrationOrder: 'migration-order',
  migrationHardcodedName: 'migration-hardcoded-name',
  startSchemaPush: 'start-schema-push',
};

export const PACKAGE_RULE_IDS = {
  unusedDependency: 'unused-dependency',
  unlistedDependency: 'unlisted-dependency',
  unresolvedImport: 'unresolved-import',
};

export const HYGIENE_EXCEPTION_RULES = Object.values(HYGIENE_RULE_IDS);
export const PACKAGE_EXCEPTION_RULES = Object.values(PACKAGE_RULE_IDS);

export const LARGE_FILE_BYTES = 1024 * 1024;

const EVERY_LANGUAGE = { typescript: true, java: true, python: true, kotlin: true, go: true };
const IMPORTS_COMPILE =
  'an import that resolves to no class is a compile error in the source sets the build compiles, which are the ones nitpicker reads, so the build fails and reports it before any analyzer runs';
const TYPESCRIPT_AND_PYTHON = { typescript: true, java: false, python: true, kotlin: false };

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
    id: HYGIENE_RULE_IDS.migrationOrder,
    check: 'repository-hygiene',
    limit:
      'a migration the change adds whose version sorts before (or with) the newest migration of its folder on the base branch (Flyway, Prisma, Drizzle, Knex, Kysely, TypeORM, MikroORM, Sequelize, golang-migrate, goose), or an Alembic or Django migration that follows a parent which already has a child on the base branch (two heads)',
    enforcedBy: EVERY_LANGUAGE,
  },
  {
    id: HYGIENE_RULE_IDS.migrationHardcodedName,
    check: 'repository-hygiene',
    limit:
      'a migration file that names the `public` schema (`public.table`), a database in `ALTER DATABASE` or a role in `OWNER TO`',
    enforcedBy: EVERY_LANGUAGE,
  },
  {
    id: HYGIENE_RULE_IDS.startSchemaPush,
    check: 'repository-hygiene',
    limit:
      'a `start`, `prestart`, `serve` or `start:*` script (not `start:dev`, `start:local`, `start:watch`, `start:debug` or `start:test`) in `package.json`, or a script it runs, that pushes the ORM schema (`prisma db push`, `prisma migrate dev`, `drizzle-kit push`, `typeorm schema:sync`, `mikro-orm schema:update`)',
    enforcedBy: EVERY_LANGUAGE,
  },
  {
    id: PACKAGE_RULE_IDS.unusedDependency,
    check: 'dead-code',
    limit:
      "a dependency in package.json (Python: in the project's dependency files) that nothing imports or runs",
    enforcedBy: TYPESCRIPT_AND_PYTHON,
  },
  {
    id: PACKAGE_RULE_IDS.unlistedDependency,
    check: 'dead-code',
    limit:
      "an import of a package that package.json (Python: the project's dependency files) does not list",
    enforcedBy: TYPESCRIPT_AND_PYTHON,
  },
  {
    id: PACKAGE_RULE_IDS.unresolvedImport,
    check: 'dead-code',
    limit: 'an import that resolves to no file and no package',
    enforcedBy: TYPESCRIPT_AND_PYTHON,
    notApplicable: { java: IMPORTS_COMPILE, kotlin: IMPORTS_COMPILE },
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
const REPORTED_EVERYWHERE = Object.fromEntries(
  ['typescript', 'javascript', 'java', 'python', 'kotlin', 'go'].map((language) => [
    language,
    'reported',
  ]),
);

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
    enforcedBy: REPORTED_EVERYWHERE,
  },
];
