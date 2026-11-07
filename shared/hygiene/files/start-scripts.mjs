import path from 'node:path';
import { pathInside } from '../../filesystem.mjs';
import { readJson } from './known-files.mjs';

const START_SCRIPT = /^(?:pre)?(?:start|serve)(?::(?!.*(?:dev|local|watch|debug|test))[\w:.-]+)?$/u;
const SEGMENT_BREAK = /&&|\|\||[;|\n]/u;
const RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'run-s', 'run-p', 'npm-run-all']);
const PRINTERS = new Set(['echo', 'printf']);
const MAX_SCRIPTS = 20;
const SCHEMA_PUSHES = [
  /(?<![\w-])prisma\b.*?\bdb\s+push\b/u,
  /(?<![\w-])prisma\b.*?\bmigrate\s+(?:dev|reset)\b/u,
  /(?<![\w-])drizzle-kit\b.*?\bpush\b/u,
  /(?<![\w-])typeorm(?:-ts-node-(?:commonjs|esm))?\b.*?\bschema:(?:sync|drop)\b/u,
  /(?<![\w-])mikro-orm\b.*?\bschema:(?:update|create|fresh|drop)\b/u,
];

function scriptsOf(projectRoot, file) {
  const full = pathInside(projectRoot, file);
  const scripts = full === undefined ? undefined : readJson(full).value?.scripts;
  return typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts) ? scripts : {};
}

function segmentsOf(command) {
  return command
    .split(SEGMENT_BREAK)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && !PRINTERS.has(segment.split(/\s+/u)[0]));
}

function calledScripts(scripts, segment) {
  const words = segment.split(/\s+/u);
  const runner = words.findIndex((word) => RUNNERS.has(word));
  const called =
    runner === -1 ? [] : words.slice(runner + 1).filter((word) => Object.hasOwn(scripts, word));
  return called.flatMap((name) => [`pre${name}`, name]);
}

function reachedSegments(scripts, start) {
  const visited = new Set([start]);
  const pending = [start];
  const segments = [];
  for (const name of pending) {
    const command = scripts[name];
    const own = typeof command === 'string' ? segmentsOf(command) : [];
    segments.push(...own);
    const next = own
      .flatMap((segment) => calledScripts(scripts, segment))
      .filter((called) => !visited.has(called) && visited.size < MAX_SCRIPTS);
    for (const called of next) {
      visited.add(called);
    }
    pending.push(...next);
  }
  return segments;
}

function pushIn(segments) {
  const found = segments
    .flatMap((segment) => SCHEMA_PUSHES.map((pattern) => pattern.exec(segment)))
    .find(Boolean);
  return found?.[0].replaceAll(/\s+/gu, ' ');
}

export function startSchemaPushes(projectRoot, files) {
  return files
    .filter((file) => path.posix.basename(file) === 'package.json')
    .filter((file) => !file.split('/').includes('node_modules'))
    .flatMap((file) => {
      const scripts = scriptsOf(projectRoot, file);
      return Object.keys(scripts)
        .filter((name) => START_SCRIPT.test(name))
        .map((name) => ({ file, script: name, command: pushIn(reachedSegments(scripts, name)) }))
        .filter(({ command }) => command !== undefined);
    });
}

export function startSchemaPushMessage({ file, script, command }) {
  return `The "${script}" script in ${file} runs \`${command}\`, which changes the database schema on every start without a migration: a deploy can drop columns and their data, and instances race to change the schema. Apply migrations in the deploy step instead (\`prisma migrate deploy\`, \`drizzle-kit migrate\`, \`typeorm migration:run\`, \`mikro-orm migration:up\`) and keep schema pushes for local development scripts.`;
}
