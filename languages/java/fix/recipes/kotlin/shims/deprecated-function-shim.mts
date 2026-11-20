import { braceDepths, closingIndex } from '../shared/kotlin-scan.mts';
import { renamePlan, shapeOf, squashed } from './function-rename.mts';
import type { Forwarded } from './function-rename.mts';
import type { PathEdit, Source } from './source-index.mts';

const REPLACE_WITH = /ReplaceWith\s*\(\s*(?:expression\s*=\s*)?"([^"\\]*)"\s*\)/u;
const FUNCTION = /^\s*(?:(?:public|internal|inline)\s+)*fun\s+(\w+)\s*\(/u;
const CALL = /^(\w+)\s*\(([^()]*)\)$/u;

function declared(source: Source, offset: number): Forwarded | undefined {
  const { code } = source.scanned;
  const open = code.indexOf('(', offset);
  const close = open === -1 ? -1 : closingIndex(code, open);
  const expression = REPLACE_WITH.exec(source.text.slice(offset, close + 1))?.[1];
  const head = FUNCTION.exec(code.slice(close + 1));
  const name = head?.[1];
  const call = CALL.exec(expression?.trim() ?? '');
  const shape = head === null ? undefined : shapeOf(code, close + head[0].length);
  const same =
    shape !== undefined &&
    call?.[1] === shape.target &&
    squashed(call[2] ?? '') === squashed(shape.names.join(',')) &&
    squashed(shape.argumentText) === squashed(shape.names.join(','));
  if (name === undefined || shape === undefined || !same || shape.target === name) {
    return undefined;
  }
  return {
    name,
    replacement: shape.target,
    start: offset,
    end: shape.end,
    parameters: shape.types,
  };
}

export function deprecatedFunctionPlan(
  sources: readonly Source[],
  source: Source,
  offset: number,
): readonly PathEdit[] | undefined {
  const forwarded =
    braceDepths(source.scanned.code)[offset] === 0 ? declared(source, offset) : undefined;
  return forwarded === undefined
    ? undefined
    : renamePlan({ sources, source, forwarded, mode: 'count' });
}
