import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { CONFIG_FILE_NAME } from '../../../../shared/config.mjs';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';

const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const MAX_LISTING_BYTES = 64 * 1024 * 1024;
const RULES_ARGUMENTS = ['--rules', '--format', 'json'];
const ENGINE_HINT =
  'Set "tools": { "eslint": { "engine": "eslint" } } in nitpicker.config.json to lint with ESLint instead.';

export function oxlintBinary() {
  return resolveTool('oxlint', { bin: 'bin/oxlint' }).binPath;
}

function listingFailure(error) {
  const stderr = error.stderr?.trim() ?? '';
  const output = stderr === '' ? (error.stdout?.trim().split('\n')[0] ?? '') : stderr;
  const status = typeof error.code === 'number' ? `exited with ${String(error.code)}` : 'failed';
  return `oxlint ${RULES_ARGUMENTS.join(' ')} ${status}: ${output || error.message}`;
}

export async function listNativeRules(temporaryRoot = tmpdir()) {
  const directory = mkdtempSync(path.join(temporaryRoot, 'nitpicker-oxlint-rules-'));
  try {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [oxlintBinary(), ...RULES_ARGUMENTS],
      { cwd: directory, maxBuffer: MAX_LISTING_BYTES },
    );
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(listingFailure(error), { cause: error });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function tsgolintBinary() {
  const packageRoot = path.dirname(resolveTool('oxlint-tsgolint', { bin: 'package.json' }).binPath);
  const executable = process.platform === 'win32' ? 'tsgolint.exe' : 'tsgolint';
  const platformPackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
  try {
    return createRequire(path.join(packageRoot, 'package.json')).resolve(
      `${platformPackage}/${executable}`,
    );
  } catch (error) {
    throw new Error(
      `The type-aware lint rules need ${platformPackage}, which is not installed. ${ENGINE_HINT}`,
      { cause: error },
    );
  }
}

export function withEngineHint(detail) {
  return detail.includes(CONFIG_FILE_NAME) ? detail : `${detail}\n${ENGINE_HINT}`;
}

export function withCompileCache(environment) {
  return {
    NODE_COMPILE_CACHE: path.join(tmpdir(), 'nitpicker-node-compile-cache'),
    ...environment,
  };
}

export function spawnJson(argumentList, { cwd, env, context, timeoutMs, acceptedStatuses = [0] }) {
  const result = spawnSync(process.execPath, argumentList, {
    cwd,
    env: withCompileCache(env),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: timeoutMs,
  });
  if (result.error !== undefined) {
    throw new Error(`${context} failed: ${result.error.message}`, { cause: result.error });
  }
  if (!acceptedStatuses.includes(result.status)) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw new Error(`${context} exited with ${String(result.status)}: ${withEngineHint(detail)}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    const detail = (result.stderr.trim() || result.stdout).slice(0, 2000);
    throw new Error(`${context} did not produce valid JSON: ${detail}`, { cause: error });
  }
}
