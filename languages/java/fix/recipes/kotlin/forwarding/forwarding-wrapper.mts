import type { RecipeFix } from '../../../../../../core/fix/typed/fix-types.mts';
import { lineAt } from '../shared/kotlin-scan.mts';
import { renamePlan, shapeOf, squashed } from '../shims/function-rename.mts';
import type { Forwarded } from '../shims/function-rename.mts';
import { projectRecipe } from '../shims/source-index.mts';
import type { Source } from '../shims/source-index.mts';

const RULE = { tool: 'pmd', rule: 'StaticForwardingWrapper' };
const SKIPPED_NAMES = new Set(['main', 'valueOf', 'fromString', 'of', 'from', 'invoke', 'copy']);
const COPY_PREFIX = /^(?:copyOf|unmodifiable|synchronized|checked)/u;
const HEAD = /^((?:public|internal|private)[ \t]+)?fun[ \t]+(\w+)[ \t]*\(/gmu;

type Head = {
  readonly start: number;
  readonly name: string;
  readonly modifier: string | undefined;
};

function forwarderAt(source: Source, { start, name, modifier }: Head): Forwarded | undefined {
  const { code } = source.scanned;
  const shape = shapeOf(code, code.indexOf('(', start));
  const skipped = SKIPPED_NAMES.has(name) || COPY_PREFIX.test(shape?.target ?? '');
  const hidden = modifier === 'private' || modifier === 'internal';
  const forwards =
    shape !== undefined && squashed(shape.argumentText) === squashed(shape.names.join(','));
  if (shape === undefined || skipped || !forwards || shape.target === name || !hidden) {
    return undefined;
  }
  if (shape.block && !shape.returned) {
    return undefined;
  }
  return {
    name,
    replacement: shape.target,
    start,
    end: shape.end,
    parameters: shape.types,
    returnType: shape.returnType,
    visibility: modifier,
  };
}

function fixesIn(sources: readonly Source[], source: Source): RecipeFix[] {
  return [...source.scanned.code.matchAll(HEAD)].flatMap((match): RecipeFix[] => {
    const head = { start: match.index, name: match[2] ?? '', modifier: match[1]?.trim() };
    const forwarded = forwarderAt(source, head);
    const edits =
      forwarded === undefined
        ? undefined
        : renamePlan({ sources, source, forwarded, mode: 'types' });
    const finding = { ...RULE, path: source.path, line: lineAt(source.text, match.index) };
    return edits === undefined
      ? []
      : [{ finding, edits: edits.map((edit) => ({ type: 'replace', ...edit })) }];
  });
}

export const kotlinForwardingWrapperRecipe = projectRecipe({
  id: 'kotlin-forwarding-wrapper',
  rule: RULE,
  where: 'main',
  find: ({ sources, source }) => fixesIn(sources, source),
});
