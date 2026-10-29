import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';

export function command(cwd, executable, args) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

export function checked(cwd, executable, args) {
  const result = command(cwd, executable, args);
  expect(result.status, `${executable} ${args.join(' ')}\n${result.output}`).toBe(0);
  return result.output.trim();
}

export function write(root, relative, contents) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

export function listing(root) {
  function walk(directory, prefix = '') {
    return readdirSync(directory).flatMap((name) => {
      const relative = path.posix.join(prefix, name);
      const location = path.join(directory, name);
      if (lstatSync(location).isDirectory()) return walk(location, relative);
      return [`${relative}:${lstatSync(location).size}`];
    });
  }
  return walk(realpathSync(root)).sort();
}

export function temporaryFiles(root) {
  const result = [];
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      const location = path.join(directory, item.name);
      if (/^\.(?:quality|nitpicker)-/.test(item.name)) result.push(path.relative(root, location));
      if (item.isDirectory()) walk(location);
    }
  }
  walk(root);
  return result;
}
