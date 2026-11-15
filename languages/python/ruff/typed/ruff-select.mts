import { createRequire } from 'node:module';
import { isStableRule as untypedStable } from '../../adapters/configuration/python-ruff-config.mjs';
import type { RuffRule } from '../../reference/typed/ruff-rule-views.mts';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';

export const isStableRuffRule: (rule: RuffRule) => boolean = untypedStable;

function parseToml(text: string): unknown {
  const toml: unknown = createRequire(import.meta.url)('smol-toml');
  const parse = fieldOf(toml, 'parse');
  if (typeof parse !== 'function') {
    throw new TypeError('smol-toml has no parse');
  }
  return Reflect.apply(parse, toml, [text]);
}

export function ruffSelect(configText: string): string[] {
  return textsOf(fieldOf(fieldOf(parseToml(configText), 'lint'), 'select'));
}

export function ruffSelection(configText: string): { select: string[]; ignore: string[] } {
  const lint = fieldOf(parseToml(configText), 'lint');
  return { select: textsOf(fieldOf(lint, 'select')), ignore: textsOf(fieldOf(lint, 'ignore')) };
}
