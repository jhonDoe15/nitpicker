import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { firstFileIn } from '../../../../shared/filesystem.mjs';
import { GO_TOOLS } from '../execution/go-tools.mjs';
import { readGoModule } from '../execution/go-module.mjs';

export const FORMATTERS = ['gofmt', 'gofumpt', 'goimports'];
const GOLANGCI_FILES = ['.golangci.yml', '.golangci.yaml', '.golangci.toml', '.golangci.json'];
const load = createRequire(import.meta.url);
const PARSERS = {
  '.toml': (text) => load('smol-toml').parse(text),
  '.json': (text) => JSON.parse(text),
};

function parseYaml(text) {
  return load('yaml').parse(text);
}

function readGolangci(projectRoot) {
  const file = firstFileIn(projectRoot, GOLANGCI_FILES);
  if (file === undefined) {
    return undefined;
  }
  const name = path.basename(file);
  const parse = PARSERS[path.extname(name)] ?? parseYaml;
  try {
    return { name, config: parse(readFileSync(file, 'utf8')) ?? {} };
  } catch (error) {
    throw Object.assign(
      new Error(`${name} could not be read: ${String(error.message)}. Fix its syntax.`, {
        cause: error,
      }),
      { rule: 'golangci-config-invalid' },
    );
  }
}

function enabledIn(section) {
  return Array.isArray(section?.enable)
    ? section.enable.filter((name) => typeof name === 'string')
    : [];
}

function listOf(value) {
  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === 'string' && entry !== '');
  }
  return typeof value === 'string' && value !== ''
    ? value.split(',').map((entry) => entry.trim())
    : [];
}

function formatterSettings(config, formatter) {
  return config.formatters?.settings?.[formatter] ?? config['linters-settings']?.[formatter] ?? {};
}

const OPTION_READERS = {
  gofmt: () => [],
  goimports: (settings) => {
    const prefixes = listOf(settings['local-prefixes']);
    return prefixes.length === 0 ? [] : ['-local', prefixes.join(',')];
  },
  gofumpt: (settings) => [
    ...(settings['extra-rules'] === true ? ['-extra'] : []),
    ...(typeof settings['module-path'] === 'string' ? ['-modpath', settings['module-path']] : []),
  ],
};

export function formatterOptions(projectRoot, formatter, precedence = []) {
  const golangci = precedence.includes('project') ? readGolangci(projectRoot) : undefined;
  return golangci === undefined
    ? []
    : OPTION_READERS[formatter](formatterSettings(golangci.config, formatter));
}

export function golangciConfigFiles(projectRoot, tools = {}) {
  const opted = ['gofumpt', 'goimports'].some((tool) =>
    tools[tool]?.precedence?.includes('project'),
  );
  return opted ? GOLANGCI_FILES.map((file) => path.join(projectRoot, file)) : [];
}

function golangciFormatters(projectRoot) {
  const golangci = readGolangci(projectRoot);
  if (golangci === undefined) {
    return undefined;
  }
  const { formatters, linters } = golangci.config;
  const enabled = [...enabledIn(formatters), ...enabledIn(linters)];
  const chosen = FORMATTERS.filter((name) => enabled.includes(name));
  return chosen.length === 0 ? undefined : { formatters: chosen, from: golangci.name };
}

function toolDirectiveFormatters(projectRoot) {
  const tools = readGoModule(projectRoot)?.tools ?? [];
  const chosen = FORMATTERS.filter((name) => tools.includes(GO_TOOLS[name]?.module));
  return chosen.length === 0
    ? undefined
    : { formatters: chosen, from: 'the tool directives in go.mod' };
}

function strongest(formatters) {
  const stricter = formatters.filter((name) => name !== 'gofmt');
  return stricter.length === 0 ? ['gofmt'] : stricter;
}

export function detectFormatters(projectRoot, setting) {
  const chosen = (setting === undefined
    ? undefined
    : { formatters: setting, from: '"go.formatters"' }) ??
    toolDirectiveFormatters(projectRoot) ??
    golangciFormatters(projectRoot) ?? { formatters: ['gofmt'], from: undefined };
  return { ...chosen, formatters: strongest(chosen.formatters) };
}
