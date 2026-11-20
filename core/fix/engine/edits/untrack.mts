import { git } from '../../../../shared/hygiene/tracked-files.mjs';

function literal(args: readonly string[]): string[] {
  return ['--literal-pathspecs', ...args];
}

export function isTracked(projectRoot: string, name: string): boolean {
  return git(projectRoot, literal(['ls-files', '-z', '--', name])) !== '';
}

export function untrackPath(projectRoot: string, name: string): void {
  if (isTracked(projectRoot, name)) {
    git(projectRoot, literal(['rm', '--cached', '--quiet', '-r', '--', name]));
  }
}

export function indexListing(projectRoot: string, name: string): string {
  return git(projectRoot, literal(['ls-files', '-s', '-z', '--', name]));
}

export function restoreIndex(projectRoot: string, listings: readonly string[]): void {
  const input = listings.filter((listing) => listing !== '').join('');
  if (input !== '') {
    git(projectRoot, ['update-index', '-z', '--add', '--index-info'], input);
  }
}
