import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { filesUnder } from '../../../../../shared/filesystem.mjs';

const EDITORCONFIG = '.editorconfig';
const ROOT = 'root = true\n';
const GENERATED_DIRECTORIES = new Set(['.git', '.gradle', '.idea', 'build', 'node_modules']);

function toPosix(file) {
  return file.split(path.sep).join('/');
}

function directoriesUp(start) {
  const parts = start.split(path.sep);
  return parts.map((_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep);
}

function repositoryRoot(start) {
  return (
    directoriesUp(start).find((directory) => existsSync(path.join(directory, '.git'))) ?? start
  );
}

function ancestorsUp(start, top) {
  return directoriesUp(start).slice(1, directoriesUp(start).indexOf(top) + 1);
}

function editorconfigsBelow(directory) {
  return [
    ...filesUnder(directory, {
      skipDirectory: (_, entry) => GENERATED_DIRECTORIES.has(entry.name),
    }),
  ].filter((file) => path.basename(file) === EDITORCONFIG);
}

function entryOf(repository, file) {
  return { path: toPosix(path.relative(repository, file)), text: readFileSync(file, 'utf8') };
}

export function projectEditorconfigs(policyRoot) {
  const start = path.resolve(policyRoot);
  const repository = repositoryRoot(start);
  const files = [
    ...ancestorsUp(start, repository).map((directory) => path.join(directory, EDITORCONFIG)),
    ...editorconfigsBelow(start),
  ].filter((file) => existsSync(file));
  return {
    offset: toPosix(path.relative(repository, start)),
    editorconfigs: files.map((file) => entryOf(repository, file)).toSorted(byPath),
    files,
  };
}

function byPath(left, right) {
  return left.path.localeCompare(right.path);
}

export function isolatedWorkspace() {
  return { offset: '', editorconfigs: [{ path: EDITORCONFIG, text: ROOT }] };
}

export function mirroredWorkspace({ offset, editorconfigs }) {
  const top = editorconfigs.find((entry) => entry.path === EDITORCONFIG);
  const rest = editorconfigs.filter((entry) => entry !== top);
  return {
    offset,
    editorconfigs: [
      { path: EDITORCONFIG, text: top === undefined ? ROOT : `${ROOT}\n${top.text}` },
      ...rest,
    ],
  };
}
