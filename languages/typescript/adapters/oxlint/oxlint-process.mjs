import { spawn } from 'node:child_process';
import { spawnSyncWithOutputFile, toolBinaryPath } from "../typed/tooling.mjs";
import { createRequire } from 'node:module';
import path from 'node:path';
import { CONFIG_FILE_NAME } from "../../../../shared/config.mjs";
import { TROUBLESHOOTING_ANCHORS } from "../../../../shared/messages/troubleshooting.mjs";
import { troubleshootingError, withTroubleshooting } from "../lint-engine/typed/tools.mjs";
import { INCOMPATIBLE_MARKER } from "../lint-engine/compatibility/incompatible-package.mjs";
import { parseJson } from "../../../../shared/values/readers.mjs";
import { withCompileCache } from "../../../../shared/processes/environment.mjs";
import { describeProcessEnd, failureDetail, } from "../../../../shared/processes/process-failure.mjs";
const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const MAX_INVALID_OUTPUT_CHARACTERS = 2000;
const ENGINE_HINT = 'Set "tools": { "eslint": { "engine": "eslint" } } in nitpicker.config.json to lint with ESLint instead.';
export function oxlintBinary() {
    return toolBinaryPath('oxlint', { bin: 'bin/oxlint' });
}
export function tsgolintBinary() {
    const packageRoot = path.dirname(toolBinaryPath('oxlint-tsgolint', { bin: 'package.json' }));
    const executable = process.platform === 'win32' ? 'tsgolint.exe' : 'tsgolint';
    const platformPackage = `@oxlint-tsgolint/${process.platform}-${process.arch}`;
    try {
        return createRequire(path.join(packageRoot, 'package.json')).resolve(`${platformPackage}/${executable}`);
    }
    catch (error) {
        throw troubleshootingError(`The type-aware lint rules need ${platformPackage}, which is not installed. ${ENGINE_HINT}`, TROUBLESHOOTING_ANCHORS.engineUnavailable, { cause: error });
    }
}
export function withEngineHint(detail) {
    if (detail.includes(INCOMPATIBLE_MARKER)) {
        return detail;
    }
    return detail.includes(CONFIG_FILE_NAME)
        ? detail
        : withTroubleshooting(`${detail}\n${ENGINE_HINT}`, TROUBLESHOOTING_ANCHORS.engineUnavailable);
}
export function spawnJson(argumentList, { cwd, env, context, timeoutMs, acceptedStatuses = [0] }) {
    const result = spawnSyncWithOutputFile(process.execPath, argumentList, {
        cwd,
        env: withCompileCache(env),
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: timeoutMs,
    });
    return parsedReport(result, { context, acceptedStatuses });
}
export async function spawnJsonAsync(argumentList, { cwd, env, context, timeoutMs, acceptedStatuses = [0] }) {
    const result = await spawnCollected(process.execPath, argumentList, {
        cwd,
        env: withCompileCache(env),
        maxBuffer: MAX_OUTPUT_BYTES,
        timeoutMs,
    });
    return parsedReport(result, { context, acceptedStatuses });
}
export function spawnCollected(command, argumentList, { cwd, env, maxBuffer, timeoutMs, }) {
    return new Promise((resolve) => {
        const child = spawn(command, argumentList, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const failures = [];
        function stop(code) {
            if (child.killed) {
                return;
            }
            failures.push(Object.assign(new Error(`spawn ${command} ${code}`), { code }));
            child.kill('SIGTERM');
        }
        const output = outputCollector(maxBuffer, () => {
            stop('ENOBUFS');
        });
        const timer = deadline(timeoutMs, () => {
            stop('ETIMEDOUT');
        });
        child.stdout.on('data', output.collect(output.stdout));
        child.stderr.on('data', output.collect(output.stderr));
        child.on('error', (error) => {
            failures.push(error);
        });
        child.on('close', (status, signal) => {
            clearTimeout(timer);
            resolve({
                status,
                signal: signal ?? undefined,
                error: failures[0],
                stdout: Buffer.concat(output.stdout).toString('utf8'),
                stderr: Buffer.concat(output.stderr).toString('utf8'),
            });
        });
    });
}
function deadline(timeoutMs, onTimeout) {
    return timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            onTimeout();
        }, timeoutMs);
}
function outputCollector(maxBuffer, onOverflow) {
    const stdout = [];
    const stderr = [];
    function collect(chunks) {
        let bytes = 0;
        return (chunk) => {
            bytes += chunk.length;
            if (bytes > maxBuffer) {
                onOverflow();
            }
            else {
                chunks.push(chunk);
            }
        };
    }
    return { stdout, stderr, collect };
}
function parsedReport(result, { context, acceptedStatuses, }) {
    if (result.error !== undefined) {
        throw new Error(`${context} failed: ${result.error.message}`, { cause: result.error });
    }
    if (!acceptedStatuses.includes(result.status)) {
        const detail = failureDetail(result) || 'no diagnostic output';
        throw new Error(describeProcessEnd(context, result, {
            detail: typeof result.signal === 'string' ? detail : withEngineHint(detail),
        }));
    }
    try {
        return parseJson(result.stdout);
    }
    catch (error) {
        const detail = (result.stderr.trim() || result.stdout).slice(0, MAX_INVALID_OUTPUT_CHARACTERS);
        throw new Error(`${context} did not produce valid JSON: ${detail}`, { cause: error });
    }
}
