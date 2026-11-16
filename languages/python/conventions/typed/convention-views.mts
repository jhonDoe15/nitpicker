import type { NitpickerConfig } from '../../../../shared/values/config-types.mts';
import { PYTHON_CONVENTIONS as UNTYPED_CONVENTIONS } from '../python-conventions.mts';
import { pythonStyle as untypedStyle } from '../python-style.mts';

type Convention = { id: string; measure: (text: string) => string | undefined };

export const PYTHON_CONVENTIONS: readonly Convention[] = UNTYPED_CONVENTIONS;

export function pythonStyle(input: { config: NitpickerConfig; projectRoot: string }): {
  summary: (conventions: object) => readonly string[];
} {
  const parts = untypedStyle(input);
  return { summary: (conventions: object) => parts.summary?.(conventions) ?? [] };
}
