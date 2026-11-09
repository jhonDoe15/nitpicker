import { runGit } from '../../../../../core/diff/git/repository/command.mjs';
import { isMigrationFile } from '../../../../../shared/hygiene/migrations/migration-files.mjs';
import { databaseKinds } from '../../../../../shared/hygiene/schema/database-kind.mjs';

const LISTING = ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];

function projectFiles(projectRoot) {
  try {
    return runGit(projectRoot, LISTING)
      .split('\0')
      .filter((file) => file.length > 0);
  } catch {
    return [];
  }
}

function gateOf(projectRoot) {
  const files = projectFiles(projectRoot);
  if (files.some((file) => isMigrationFile(file))) {
    return () => false;
  }
  const kindOf = databaseKinds(projectRoot, files);
  return (file) => kindOf(file) !== 'mysql';
}

export function foreignKeyGate(projectRoot) {
  let gate;
  return (file) => {
    gate ??= gateOf(projectRoot);
    return gate(file);
  };
}
