import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { HYGIENE_RULE_IDS, LARGE_FILE_BYTES, exceptionHint } from '../rules.mjs';
import { fileSize } from '../tracked-files.mjs';

export const REPOSITORY_HYGIENE_TOOL = 'repository-hygiene';
const TEMPLATE_WORDS = new Set(['example', 'sample', 'template', 'dist', 'default', 'defaults']);
const PRIVATE_KEY_NAME = /^id_(?:rsa|dsa|ecdsa|ed25519)$|\.(?:p12|pfx|jks|keystore|ppk)$/iu;
const PRIVATE_KEY_HEADER = '-----BEGIN [A-Z ]*PRIVATE KEY';
const BINARY_EXTENSION =
  /\.(?:jar|war|ear|class|exe|dll|so|dylib|a|o|lib|bin|zip|tar|tgz|gz|bz2|xz|7z|rar|whl|egg|pyc|pyo|node)$/iu;
const ALLOWED_BINARY_NAMES = new Set(['gradle-wrapper.jar']);
const LOCK_FILE = /(?:^|[-.])(?:lock|lock\.json|lock\.yaml|lockb)$/iu;
const MAX_GREP_BYTES = 64 * 1024 * 1024;

export function collectRepositoryFindings({ projectRoot, files }) {
  const keyFiles = new Set(filesWithPrivateKeys(projectRoot));
  return files.flatMap((file) => {
    const base = path.posix.basename(file);
    if (isEnvFile(base)) {
      return [problem('committedEnvFile', file, envMessage(file))];
    }
    if (keyFiles.has(file) || PRIVATE_KEY_NAME.test(base)) {
      return [problem('committedPrivateKey', file, keyMessage(file))];
    }
    if (BINARY_EXTENSION.test(base) && !ALLOWED_BINARY_NAMES.has(base)) {
      return [problem('committedBinary', file, binaryMessage(file))];
    }
    return isLarge(projectRoot, file, base)
      ? [problem('largeFile', file, largeMessage(file, projectRoot))]
      : [];
  });
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

function isEnvFile(base) {
  const isEnv = base === '.env' || base.startsWith('.env.') || base.endsWith('.env');
  return isEnv && !base.split('.').some((segment) => TEMPLATE_WORDS.has(segment));
}

function isLarge(projectRoot, file, base) {
  return !LOCK_FILE.test(base) && (fileSize(projectRoot, file) ?? 0) > LARGE_FILE_BYTES;
}

function envMessage(file) {
  return `Environment file ${file} is committed and usually holds secrets. Remove it, rotate what it held, and commit a .env.example with placeholder values.`;
}

function keyMessage(file) {
  return `${file} holds a private key. Remove it, rotate the key, and load it from the environment or a secret store.`;
}

function binaryMessage(file) {
  return `${file} is a compiled or archived binary. Build it in CI or fetch it from a registry instead of committing it.`;
}

function largeMessage(file, projectRoot) {
  const megabytes = ((fileSize(projectRoot, file) ?? 0) / (1024 * 1024)).toFixed(1);
  return `${file} is ${megabytes} MB (limit ${String(LARGE_FILE_BYTES / (1024 * 1024))} MB). Store large assets outside git, or keep them in a registry or LFS.`;
}

function filesWithPrivateKeys(projectRoot) {
  const result = spawnSync(
    'git',
    ['grep', '-l', '-I', '-z', '-E', '-e', PRIVATE_KEY_HEADER, '--'],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      maxBuffer: MAX_GREP_BYTES,
    },
  );
  if (result.error !== undefined || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`git grep failed: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.split('\0').filter((entry) => entry.length > 0);
}
