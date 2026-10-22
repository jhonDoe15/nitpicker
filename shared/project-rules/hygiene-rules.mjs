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

const EVERY_LANGUAGE = { typescript: true, java: true, python: true, kotlin: true, go: true };
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
