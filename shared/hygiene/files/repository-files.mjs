import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { HYGIENE_RULE_IDS, LARGE_FILE_BYTES, exceptionEntry, exceptionHint } from '../rules.mjs';
import { committedSizes } from '../tracked-files.mjs';
import { buildOutputFolders } from './build-output.mjs';
import { holdsOnlyPublicValues, isEnvFileName } from './env-files.mjs';
import { committedTooling, isKeyFileName, isLockFile } from './known-files.mjs';

export const REPOSITORY_HYGIENE_TOOL = 'repository-hygiene';
const PRIVATE_KEY_HEADER = '-----BEGIN [A-Z ]*PRIVATE KEY';
const BINARY_EXTENSION =
  /\.(?:jar|war|ear|class|exe|dll|so|dylib|a|o|lib|bin|zip|tar|tgz|gz|bz2|xz|7z|rar|whl|egg|pyc|pyo|node)$/iu;
const MAX_GREP_BYTES = 64 * 1024 * 1024;
const MEGABYTE = 1024 * 1024;

export function collectRepositoryFindings({ projectRoot, files }) {
  const keyFiles = new Set(filesWithPrivateKeys(projectRoot));
  const sizes = committedSizes(projectRoot);
  const isTooling = committedTooling(projectRoot, files);
  const output = buildOutputFolders(projectRoot, files);
  const fileFindings = files.flatMap((file) => {
    const base = path.posix.basename(file);
    if (isEnvFileName(base) && !isPublicEnvFile(projectRoot, file)) {
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
  return [...fileFindings, ...output.folders.map(outputProblem)];
}

function outputProblem({ folder, anchor }) {
  const rule = HYGIENE_RULE_IDS.committedBuildOutput;
  return {
    tool: REPOSITORY_HYGIENE_TOOL,
    rule,
    path: anchor ?? `${folder}/`,
    identity: `${folder}|build-output`,
    message: outputMessage(folder, exceptionEntry(rule, `${folder}/**`)),
    classification: 'enforceable',
    exceptionPaths: [folder, `${folder}/`],
  };
}

function problem(ruleName, file, text) {
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

function isPublicEnvFile(projectRoot, file) {
  const filePath = path.join(projectRoot, file);
  const stats = lstatSync(filePath, { throwIfNoEntry: false });
  return stats?.isFile() === true && holdsOnlyPublicValues(readFileSync(filePath, 'utf8'));
}

function envMessage(file) {
  return `Environment file ${file} is committed and usually holds secrets. Remove it, rotate what it held, and commit a .env.example with placeholder values.`;
}

function keyMessage(file, verb) {
  return `${file} ${verb} a private key. Remove it, rotate the key, and load it from the environment or a secret store.`;
}

function binaryMessage(file) {
  return `${file} is a compiled or archived binary. Build it in CI or fetch it from a registry instead of committing it.`;
}

function outputMessage(folder, entry) {
  return `${folder}/ looks like build output tracked in git. If it holds sources or build scripts, add ${entry} to "exceptions" in nitpicker.config.json, or rename it. Otherwise untrack it with \`git rm -r --cached ${folder}\`, add \`${folder}/\` to .gitignore, and let CI produce it.`;
}

function largeMessage(file, size) {
  const megabytes = (size / MEGABYTE).toFixed(1);
  return `${file} is ${megabytes} MB (limit ${String(LARGE_FILE_BYTES / MEGABYTE)} MB). Store large assets outside git, or keep them in a registry or LFS.`;
}

function filesWithPrivateKeys(projectRoot) {
  const result = spawnSync(
    'git',
    ['grep', '-l', '-I', '-z', '-E', '-e', PRIVATE_KEY_HEADER, '--'],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: MAX_GREP_BYTES },
  );
  if (result.error !== undefined || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`git grep failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.split('\0').filter((entry) => entry.length > 0);
}
