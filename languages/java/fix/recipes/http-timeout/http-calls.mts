import { standingOf, type Source, type SpanEdit } from '../source/java-source.mts';
import { closing } from '../source/java-text.mts';
import { escapeRegExp } from '../../../adapters/typed/regex-escape.mts';

export type Call = {
  readonly start: number;
  readonly open: number;
  readonly close: number;
  readonly chain: readonly string[];
  readonly assigned: boolean;
  readonly returned: boolean;
};

export type Found = { readonly edits: readonly SpanEdit[]; readonly at: number };

const LIMIT = 64;
const LOOKBEHIND = 40;

export function resolves(
  source: Source,
  owner: { readonly simple: string; readonly fqn: string },
): boolean {
  const standing = standingOf(source, owner.simple, owner.fqn);
  const packageName = owner.fqn.slice(0, owner.fqn.lastIndexOf('.'));
  return (
    standing === 'same' ||
    (standing === 'free' &&
      source.imports.some((line) => line.wildcard && !line.isStatic && line.fqn === packageName))
  );
}

const NEXT_CALL = /\s*\.\s*([A-Za-z_]\w*)\s*\(/uy;

function chainAfter(code: string, close: number): string[] {
  const names: string[] = [];
  const pending = [close + 1];
  for (const at of pending) {
    NEXT_CALL.lastIndex = at;
    const found = NEXT_CALL.exec(code);
    const end = found === null ? -1 : closing(code, found.index + found[0].length - 1, '()');
    if (found !== null && end !== -1 && pending.length < LIMIT) {
      names.push(found[1] ?? '');
      pending.push(end + 1);
    }
  }
  return names;
}

export function callsOf(
  source: Source,
  owner: { readonly simple: string; readonly fqn: string },
  method: string,
): Call[] {
  if (!resolves(source, owner)) {
    return [];
  }
  const pattern = new RegExp(
    String.raw`(?<![\w.$])${escapeRegExp(owner.simple)}\s*\.\s*${escapeRegExp(method)}\s*\(`,
    'gu',
  );
  return [...source.code.matchAll(pattern)].flatMap((found) => {
    const open = found.index + found[0].length - 1;
    const close = closing(source.code, open, '()');
    const before = source.code.slice(Math.max(0, found.index - LOOKBEHIND), found.index);
    return close === -1
      ? []
      : [
          {
            start: found.index,
            open,
            close,
            chain: chainAfter(source.code, close),
            assigned: /(?:^|[^=!<>])=\s*$/u.test(before),
            returned: /\breturn\s*$/u.test(before),
          },
        ];
  });
}
