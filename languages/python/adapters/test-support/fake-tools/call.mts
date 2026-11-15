import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FakeCall, FakeInput } from '../typed/fake-call.mts';

export function newCall({ tool, args, cwd, env }: FakeInput): FakeCall {
  const result = { status: 0, stdout: '', stderr: '' };
  function appendOutput(stream: 'stdout' | 'stderr', text: string): void {
    result[stream] += text;
  }
  return { tool, args, cwd, env, result, appendOutput };
}

export function out(call: FakeCall, text: string): void {
  call.appendOutput('stdout', text);
}

export function err(call: FakeCall, text: string): void {
  call.appendOutput('stderr', text);
}

export function at(call: FakeCall, file: string): string {
  return path.resolve(call.cwd, file);
}

export function exists(call: FakeCall, file: string): boolean {
  return existsSync(at(call, file));
}

export function read(call: FakeCall, file: string): string {
  return readFileSync(at(call, file), 'utf8');
}

export function readOr(call: FakeCall, file: string, fallback: string): string {
  return exists(call, file) ? read(call, file) : fallback;
}

export function write(call: FakeCall, file: string, text: string): void {
  writeFileSync(at(call, file), text);
}

export function lines(call: FakeCall, file: string): string[] {
  return exists(call, file) ? read(call, file).split('\n').filter(Boolean) : [];
}

export function valueOf(call: FakeCall, flag: string): string {
  return call.args[call.args.indexOf(flag) + 1] ?? '';
}
