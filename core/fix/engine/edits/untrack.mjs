import { git } from '../../../../shared/hygiene/tracked-files.mjs';

function literal(args) {
  return ['--literal-pathspecs', ...args];
}

export function isTracked(projectRoot, name) {
  return git(projectRoot, literal(['ls-files', '-z', '--', name])) !== '';
}

export function untrackPath(projectRoot, name) {
  if (isTracked(projectRoot, name)) {
    git(projectRoot, literal(['rm', '--cached', '--quiet', '-r', '--', name]));
  }
}

export function indexListing(projectRoot, name) {
  return git(projectRoot, literal(['ls-files', '-s', '-z', '--', name]));
}

export function restoreIndex(projectRoot, listings) {
  const input = listings.filter((listing) => listing !== '').join('');
  if (input !== '') {
    git(projectRoot, ['update-index', '-z', '--add', '--index-info'], input);
  }
}
