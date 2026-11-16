import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readStamped } from '../../../modules/stamped-file-cache.mjs';
import { projectFilesUnder } from '../../../../../../shared/project-files/project-files.mjs';

const MANIFEST = 'package.json';
const SOURCE_FILE = /\.[cm]?[jt]s$/u;
const SKIPPED = /(?:^|[\\/])(?:node_modules|dist|build|coverage|\.next)(?:[\\/]|$)/u;
const MAX_FILES = 4000;
const MAX_BYTES = 400_000;
const COMMENTS = /\/\*[\s\S]*?\*\/|(?<![:'"`])\/\/[^\n]*/gu;
const TRIMMER = String.raw`\w*(?:Trim|Strip)\w*`;
const GLOBAL_REGISTRATIONS = [
  String.raw`\buse(?:Global)?(?:Pipes|Interceptors|Filters)\s*\(\s*new\s+${TRIMMER}\s*\(`,
  String.raw`\bprovide\s*:\s*APP_(?:PIPE|INTERCEPTOR)\b[^}]{0,120}\buse(?:Class|Value)\s*:\s*(?:new\s+)?${TRIMMER}\b`,
  String.raw`\buseClass\s*:\s*${TRIMMER}\b[^}]{0,120}\bprovide\s*:\s*APP_(?:PIPE|INTERCEPTOR)\b`,
  String.raw`\bapp\.use\(\s*(?:\w*[Tt]rim\w*|\w*[Ss]trip\w*)\s*[,)]`,
  String.raw`\.apply\(\s*${TRIMMER}\s*[,)]`,
  String.raw`\baddHook\(\s*['"]pre(?:Validation|Handler)['"][\s\S]{0,400}?\.trim\(`,
].map((source) => new RegExp(source, 'u'));

const scans = new Map();

function projectRootOf(fileName) {
  const parts = path.dirname(fileName).split(path.sep);
  const directories = parts.map(
    (_, index) => parts.slice(0, parts.length - index).join(path.sep) || path.sep,
  );
  return (
    directories.find((directory) => existsSync(path.join(directory, MANIFEST))) ??
    path.dirname(fileName)
  );
}

function readable(file) {
  return (
    SOURCE_FILE.test(file) &&
    !SKIPPED.test(file) &&
    statSync(file, { throwIfNoEntry: false })?.size < MAX_BYTES
  );
}

function registersTrimmer(text) {
  const code = text.replaceAll(COMMENTS, '');
  return GLOBAL_REGISTRATIONS.some((pattern) => pattern.test(code));
}

function scan(root) {
  return projectFilesUnder(root)
    .filter(readable)
    .slice(0, MAX_FILES)
    .some((file) => registersTrimmer(readFileSync(file, 'utf8')));
}

export function hasGlobalTrimmer(fileName) {
  const root = projectRootOf(fileName);
  return readStamped(scans, path.join(root, MANIFEST), () => scan(root)) ?? false;
}
