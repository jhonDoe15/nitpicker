import path from 'node:path';

const FLYWAY = /^V(?<version>\d+(?:[._]\d+)*)__[^/]+\.(?:sql|java|kt|groovy|scala)$/u;
const NUMBERED = /^(?<version>\d+(?:[-_]\d+)*)[-_][^/]*\.(?:[cm]?[jt]s|sql|go)$/u;
const MIKRO_ORM = /^Migration(?<version>\d{14})(?:_\w+)?\.[cm]?[jt]s$/u;
const PRISMA = /^(?<set>(?:.*\/)?migrations)\/(?<name>(?<version>\d{14})_[^/]+)\/migration\.sql$/u;
const NOT_A_MIGRATION = /\.(?:test|spec)\.[cm]?[jt]s$|\.d\.[cm]?ts$|_test\.go$/u;
const UP_OR_DOWN = /\.(?:up|down)\.sql$/u;
const ORDERED_FOLDERS = new Set(['migrations', 'migration', 'drizzle']);
const MIGRATION_FOLDERS = new Set([...ORDERED_FOLDERS, 'migrate']);
const CHANGELOG_FOLDERS = new Set(['changelog', 'changelogs']);
const SCRIPT = /\.(?:sql|[cm]?[jt]s|py|java|kt|go)$/u;
const CHANGELOG = /\.(?:sql|xml|ya?ml)$/u;
const DJANGO_NAME = /^\d{4}_\w+\.py$/u;
const ZERO = BigInt(0);

function versionParts(text) {
  return text.split(/[-._]/u).map((part) => BigInt(part));
}

export function compareVersions(left, right) {
  const length = Math.max(left.length, right.length);
  const difference =
    Array.from({ length }, (_part, index) => (left[index] ?? ZERO) - (right[index] ?? ZERO)).find(
      (part) => part !== ZERO,
    ) ?? ZERO;
  if (difference === ZERO) {
    return 0;
  }
  return difference < ZERO ? -1 : 1;
}

function migration({ file, set, name, label }) {
  return { path: file, set, name, label, version: versionParts(label) };
}

function folderMigration(file, folder, base) {
  if (
    !ORDERED_FOLDERS.has(path.posix.basename(folder).toLowerCase()) ||
    NOT_A_MIGRATION.test(base)
  ) {
    return undefined;
  }
  const match = MIKRO_ORM.exec(base) ?? NUMBERED.exec(base);
  return match === null
    ? undefined
    : migration({
        file,
        set: folder,
        name: base.replace(UP_OR_DOWN, ''),
        label: match.groups.version,
      });
}

function orderedMigration(file) {
  const prisma = PRISMA.exec(file);
  if (prisma !== null) {
    const { set, name, version } = prisma.groups;
    return migration({ file, set, name, label: version });
  }
  const folder = path.posix.dirname(file);
  const base = path.posix.basename(file);
  const flyway = FLYWAY.exec(base);
  return flyway === null
    ? folderMigration(file, folder, base)
    : migration({ file, set: folder, name: base, label: flyway.groups.version });
}

export function graphCandidate(file) {
  const folder = path.posix.dirname(file);
  const base = path.posix.basename(file);
  const folderName = path.posix.basename(folder);
  if (folderName === 'versions' && base.endsWith('.py') && !base.startsWith('__')) {
    return { kind: 'alembic', set: folder };
  }
  return folderName === 'migrations' && DJANGO_NAME.test(base)
    ? { kind: 'django', set: folder, app: path.posix.basename(path.posix.dirname(folder)) }
    : undefined;
}

function inFolder(file, folders) {
  return path.posix
    .dirname(file)
    .split('/')
    .some((segment) => folders.has(segment.toLowerCase()));
}

export function isMigrationFile(file) {
  const base = path.posix.basename(file);
  if (NOT_A_MIGRATION.test(base)) {
    return false;
  }
  if (orderedMigration(file) !== undefined || graphCandidate(file) !== undefined) {
    return true;
  }
  if (CHANGELOG.test(base) && (inFolder(file, CHANGELOG_FOLDERS) || /changelog/iu.test(base))) {
    return true;
  }
  return SCRIPT.test(base) && MIGRATION_FOLDERS.has(path.posix.basename(path.posix.dirname(file)));
}

export function migrationSets(files) {
  const sets = new Map();
  for (const found of files.map(orderedMigration).filter((member) => member !== undefined)) {
    const members = sets.get(found.set) ?? new Map();
    if (!members.has(found.name)) {
      members.set(found.name, found);
    }
    sets.set(found.set, members);
  }
  return sets;
}
