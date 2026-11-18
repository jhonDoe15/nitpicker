import { isStableRule as untypedStable } from '../../adapters/configuration/python-ruff-config.mts';
import type { RuffRule } from '../../reference/typed/ruff-rule-views.mts';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import { toml } from '../../libraries/project-files.mts';

export const isStableRuffRule: (rule: RuffRule) => boolean = untypedStable;

function parseToml(text: string): unknown {
  return toml().parse(text);
}

export function ruffSelect(configText: string): string[] {
  return textsOf(fieldOf(fieldOf(parseToml(configText), 'lint'), 'select'));
}

export function ruffSelection(configText: string): { select: string[]; ignore: string[] } {
  const lint = fieldOf(parseToml(configText), 'lint');
  return { select: textsOf(fieldOf(lint, 'select')), ignore: textsOf(fieldOf(lint, 'ignore')) };
}
