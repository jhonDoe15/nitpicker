import {
  declarationSpan,
  declaresName,
  isQualifiedBy,
  mentionedInJava,
  packageOf,
  renameUses,
  usesOf,
  wordPattern,
} from './source-index.mts';
import type { PathEdit, Source } from './source-index.mts';

const ALIAS = /^typealias\s+(\w+)\s*=\s*(\w+)\s*$/mu;
const MODIFIERS = /^[ \t]*(?:(?:public|internal)[ \t]+)?$/u;

export type AliasPlan = { readonly edits: readonly PathEdit[]; readonly deprecatedAt: number };

function usable(sources: readonly Source[], source: Source, alias: string): boolean {
  const owner = packageOf(source);
  return (
    declaresName(sources, alias) === 1 &&
    !mentionedInJava(sources, wordPattern(alias, 'u')) &&
    usesOf(sources, alias).every(
      ({ source: user, offset }) =>
        user.scanned.code.charAt(offset - 1) !== '.' ||
        isQualifiedBy(user.scanned.code, offset, owner),
    )
  );
}

type AliasInput = {
  readonly sources: readonly Source[];
  readonly source: Source;
  readonly offset: number;
  readonly deprecated: number | undefined;
};

export function aliasPlan({
  sources,
  source,
  offset,
  deprecated,
}: AliasInput): AliasPlan | undefined {
  const { code } = source.scanned;
  const lineStart = code.lastIndexOf('\n', offset) + 1;
  const newline = code.indexOf('\n', offset);
  const lineEnd = newline === -1 ? code.length : newline;
  const match = ALIAS.exec(code.slice(offset, lineEnd));
  const [, alias, target] = match ?? [];
  if (
    alias === undefined ||
    target === undefined ||
    !MODIFIERS.test(code.slice(lineStart, offset))
  ) {
    return undefined;
  }
  const removal = declarationSpan(source, deprecated ?? offset, lineEnd);
  if (removal === undefined || !usable(sources, source, alias)) {
    return undefined;
  }
  const owner = packageOf(source);
  const uses = usesOf(sources, alias).filter(
    (use) => !(use.source === source && use.offset >= offset && use.offset < lineEnd),
  );
  const qualified = owner === '' ? target : `${owner}.${target}`;
  return {
    edits: [
      ...renameUses(uses, { from: alias, to: target, qualified }),
      { ...removal, text: '', path: source.path },
    ],
    deprecatedAt: deprecated ?? -1,
  };
}
