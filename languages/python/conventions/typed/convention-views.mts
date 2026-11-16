import { PYTHON_CONVENTIONS as UNTYPED_CONVENTIONS } from '../python-conventions.mjs';
import { pythonStyle as untypedStyle } from '../python-style.mjs';

type Convention = { id: string; measure: (text: string) => string | undefined };

export const PYTHON_CONVENTIONS: readonly Convention[] = UNTYPED_CONVENTIONS;

export function pythonStyle(input: { config: object; projectRoot: string }): {
  summary: (conventions: object) => string[];
} {
  return untypedStyle({ ...input, source: undefined, configRoot: undefined });
}
