import path from 'node:path';
import { pathInside } from '../../filesystem.mjs';
import { readJson } from './known-files.mjs';

const START_SCRIPT = /^(?:pre)?(?:start|serve)(?::prod(?:uction)?)?$/u;
const RUN_SCRIPT = /\b(?:npm|pnpm|yarn|bun)\s+run\s+([\w:.-]+)/gu;
const SCHEMA_PUSHES = [
  /\bprisma\s+db\s+push\b/u,
  /\bprisma\s+migrate\s+(?:dev|reset)\b/u,
  /\bdrizzle-kit\s+push\b/u,
  /\btypeorm(?:-ts-node-(?:commonjs|esm))?\s+schema:(?:sync|drop)\b/u,
  /\bmikro-orm\s+schema:(?:update|create|fresh|drop)\b/u,
];

function scriptsOf(projectRoot, file) {
  const full = pathInside(projectRoot, file);
  const scripts = full === undefined ? undefined : readJson(full).value?.scripts;
  return typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts) ? scripts : {};
}

function commandText(scripts, name) {
  const command = scripts[name];
  if (typeof command !== 'string') {
    return '';
  }
  const called = [...command.matchAll(RUN_SCRIPT)].map(([, script]) => scripts[script]);
  return [command, ...called.filter((text) => typeof text === 'string')].join('\n');
}

function pushIn(text) {
  const found = SCHEMA_PUSHES.map((pattern) => pattern.exec(text)).find(Boolean);
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
        .map((name) => ({ file, script: name, command: pushIn(commandText(scripts, name)) }))
        .filter(({ command }) => command !== undefined);
    });
}

export function startSchemaPushMessage({ file, script, command }) {
  return `The "${script}" script in ${file} runs \`${command}\`, which changes the database schema on every start without a migration: a deploy can drop columns and their data, and instances race to change the schema. Apply migrations in the deploy step instead (\`prisma migrate deploy\`, \`drizzle-kit migrate\`, \`typeorm migration:run\`, \`mikro-orm migration:up\`) and keep schema pushes for local development scripts.`;
}
