import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../filesystem.mts';
import { HYGIENE_RULE_IDS, LARGE_FILE_BYTES } from '../../project-rules/hygiene-rules.mts';
import {
  escapeGlob,
  exceptionEntryText,
  exceptionSentence,
} from '../../messages/exception-sentence.mts';
import { exceptionHint } from '../rules.mts';
import { committedSizes } from '../tracked-files.mts';
import { buildOutputFolders } from './build-output.mts';
import { holdsNoSecrets, isEnvFileName } from './env-files.mts';
import { committedTooling, isKeyFileName, isLockFile } from './known-files.mts';
import { startSchemaPushes, startSchemaPushMessage } from './start-scripts.mts';
import { GIT_TIMEOUT_MS } from '../../processes/deadlines.mts';
import type { PathFinding, RepositoryContext } from '../check-types.mts';

type RuleName = keyof typeof HYGIENE_RULE_IDS;

export const REPOSITORY_HYGIENE_TOOL = 'repository-hygiene';
export const PRIVATE_KEY_HEADER = '-----BEGIN [A-Z ]*PRIVATE KEY';
const KEY_BLOCK_START = new RegExp(`${PRIVATE_KEY_HEADER}(?: BLOCK)?-----`, 'gu');
const KEY_BLOCK_END = '-----END';
const MAX_KEY_BLOCK_LENGTH = 8192;
const KEY_LINE_BREAK = /\s+|\\[nr]/u;
const KEY_LINE_WRAPPING = /^["'`+,;()]+|["'`+,;()\\]+$/gu;
const KEY_MATERIAL = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d+/]{40,}={0,2}$/u;
const BINARY_EXTENSION =
  /\.(?:jar|war|ear|class|exe|dll|so|dylib|a|o|lib|bin|zip|tar|tgz|gz|bz2|xz|7z|rar|whl|egg|pyc|pyo|node)$/iu;
const MAX_GREP_BYTES = 64 * 1024 * 1024;
const MEGABYTE = 1024 * 1024;

export function collectRepositoryFindings({
  projectRoot,
  files,
}: Pick<RepositoryContext, 'projectRoot' | 'files'>): PathFinding[] {
  const keyFiles = new Set(filesWithPrivateKeys(projectRoot));
  const sizes = committedSizes(projectRoot);
  const isTooling = committedTooling(projectRoot, files);
  const output = buildOutputFolders(projectRoot, files);
  const fileFindings = files.flatMap((file) => {
    const base = path.posix.basename(file);
    if (isEnvFileName(base) && !isSecretFreeEnvFile(projectRoot, file)) {
      return [problem('committedEnvFile', file, envMessage(file))];
    }
    if (keyFiles.has(file)) {
      return [problem('committedPrivateKey', file, keyMessage(file, 'holds'))];
    }
    if (isKeyFileName(base)) {
      return [problem('committedPrivateKey', file, keyMessage(file, 'may hold'))];
    }
    if (isTooling(file) || output.files.has(file)) {
      return [];
    }
    if (BINARY_EXTENSION.test(base)) {
      return [problem('committedBinary', file, binaryMessage(file))];
    }
    const size = sizes.get(file) ?? 0;
    return size > LARGE_FILE_BYTES && !isLockFile(base)
      ? [problem('largeFile', file, largeMessage(file, size))]
      : [];
  });
  const pushes = startSchemaPushes(projectRoot, files).map((push) => ({
    ...problem('startSchemaPush', push.file, startSchemaPushMessage(push)),
    identity: `${push.file}|${push.script}|start-schema-push`,
  }));
  return [...fileFindings, ...output.folders.map(outputProblem), ...pushes];
}

function outputProblem({
  folder,
  anchor,
}: {
  readonly folder: string;
  readonly anchor: string | undefined;
}): PathFinding {
  const rule = HYGIENE_RULE_IDS.committedBuildOutput;
  return {
    tool: REPOSITORY_HYGIENE_TOOL,
    rule,
    path: anchor ?? `${folder}/`,
    identity: `${folder}|build-output`,
    message: outputMessage(
      folder,
      exceptionSentence(
        exceptionEntryText({ rule, path: folder, glob: `${escapeGlob(folder)}/**` }),
      ),
    ),
    classification: 'enforceable',
    exceptionPaths: [folder, `${folder}/`],
  };
}

function problem(ruleName: RuleName, file: string, text: string): PathFinding {
  const rule = HYGIENE_RULE_IDS[ruleName];
  return {
    tool: REPOSITORY_HYGIENE_TOOL,
    rule,
    path: file,
    identity: `file:${file}`,
    message: `${text} ${exceptionHint(rule, file)}`,
    classification: 'enforceable',
  };
}

function isSecretFreeEnvFile(projectRoot: string, file: string): boolean {
  const filePath = pathInside(projectRoot, file);
  if (filePath === undefined) {
    return false;
  }
  const stats = lstatSync(filePath, { throwIfNoEntry: false });
  return (
    stats?.isFile() === true && stats.size <= MEGABYTE && holdsNoSecrets(readEnvText(filePath))
  );
}

function readEnvText(filePath: string): string {
  const text = readFileSync(filePath, 'utf8');
  return text.includes('\0') ? '\0' : text;
}

function envMessage(file: string): string {
  return `Environment file ${file} is committed and holds secret values. Remove it, rotate what it held, and commit a .env.example with placeholder values.`;
}

function keyMessage(file: string, verb: string): string {
  return `${file} ${verb} a private key. Remove it, rotate the key, and load it from the environment or a secret store.`;
}

function binaryMessage(file: string): string {
  return `${file} is a compiled or archived binary. Build it in CI or fetch it from a registry instead of committing it.`;
}

function outputMessage(folder: string, route: string): string {
  return `${folder}/ looks like build output tracked in git. Untrack it with \`git rm -r --cached ${folder}\`, add \`${folder}/\` to .gitignore, and let CI produce it; if it holds sources or build scripts, rename it. ${route}`;
}

function largeMessage(file: string, size: number): string {
  const megabytes = (size / MEGABYTE).toFixed(1);
  return `${file} is ${megabytes} MB (limit ${String(LARGE_FILE_BYTES / MEGABYTE)} MB). Store large assets outside git, or keep them in a registry or LFS.`;
}

function filesWithPrivateKeys(projectRoot: string): string[] {
  const result = spawnSync(
    'git',
    ['grep', '-l', '-I', '-z', '-E', '-e', PRIVATE_KEY_HEADER, '--'],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: MAX_GREP_BYTES, timeout: GIT_TIMEOUT_MS },
  );
  if (result.error !== undefined || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`git grep failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout
    .split('\0')
    .filter((entry) => entry.length > 0)
    .filter((file) => holdsKeyMaterial(textOf(path.join(projectRoot, file))));
}

function textOf(file: string): string {
  return lstatSync(file, { throwIfNoEntry: false })?.isFile() === true
    ? readFileSync(file, 'utf8')
    : '';
}

function holdsKeyMaterial(text: string): boolean {
  return [...text.matchAll(KEY_BLOCK_START)].some(({ index, 0: marker }) => {
    const rest = text.slice(index + marker.length, index + marker.length + MAX_KEY_BLOCK_LENGTH);
    const end = rest.indexOf(KEY_BLOCK_END);
    return (end === -1 ? rest : rest.slice(0, end))
      .split(KEY_LINE_BREAK)
      .some((part) => KEY_MATERIAL.test(part.replaceAll(KEY_LINE_WRAPPING, '')));
  });
}
