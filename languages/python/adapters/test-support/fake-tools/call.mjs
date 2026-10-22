import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function newCall({ tool, args, cwd, env }) {
  return { tool, args, cwd, env, result: { status: 0, stdout: '', stderr: '' } };
}

export function out(call, text) {
  call.result.stdout += text;
}

export function err(call, text) {
  call.result.stderr += text;
}

export function at(call, file) {
  return path.resolve(call.cwd, file);
}

export function exists(call, file) {
  return existsSync(at(call, file));
}

export function read(call, file) {
  return readFileSync(at(call, file), 'utf8');
}

export function readOr(call, file, fallback) {
  return exists(call, file) ? read(call, file) : fallback;
}

export function write(call, file, text) {
  writeFileSync(at(call, file), text);
}

export function lines(call, file) {
  return exists(call, file) ? read(call, file).split('\n').filter(Boolean) : [];
}

export function valueOf(call, flag) {
  return call.args[call.args.indexOf(flag) + 1];
}
