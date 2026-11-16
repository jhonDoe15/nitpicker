import type { CoverBlock, CoverProfile, Position } from '../go-types.mts';

type Groups = Readonly<Record<string, string | undefined>>;
type Blocks = Map<string, CoverBlock>;

const RANGE = String.raw`(?<startLine>\d+)\.(?<startColumn>\d+),(?<endLine>\d+)\.(?<endColumn>\d+)`;
const BLOCK = new RegExp(
  String.raw`^(?<file>.+\.go):${RANGE} (?<statements>\d+) (?<count>\d+)$`,
  'u',
);
const MODE = /^mode: (?<mode>\w+)$/u;

export function comparePositions(left: Position, right: Position): number {
  return left.line - right.line || left.column - right.column;
}

function relativeFile(file: string, modulePath: string | undefined) {
  if (modulePath === undefined) {
    return undefined;
  }
  return file.startsWith(`${modulePath}/`) ? file.slice(modulePath.length + 1) : undefined;
}

function blockOf(groups: Groups): CoverBlock {
  return {
    start: { line: Number(groups['startLine']), column: Number(groups['startColumn']) },
    end: { line: Number(groups['endLine']), column: Number(groups['endColumn']) },
    statements: Number(groups['statements']),
    count: Number(groups['count']),
  };
}

function addBlock(files: Map<string, Blocks>, file: string, block: CoverBlock) {
  const blocks = files.get(file) ?? new Map<string, CoverBlock>();
  const key = `${String(block.start.line)}.${String(block.start.column)}`;
  const previous = blocks.get(key);
  blocks.set(
    key,
    previous === undefined ? block : { ...block, count: previous.count + block.count },
  );
  files.set(file, blocks);
}

export function parseCoverProfile(text: string, modulePath: string | undefined): CoverProfile {
  const files = new Map<string, Blocks>();
  let mode = 'set';
  for (const line of text.split(/\r?\n/u)) {
    const declared = MODE.exec(line)?.groups?.['mode'];
    const groups = BLOCK.exec(line)?.groups;
    const file = groups === undefined ? undefined : relativeFile(groups['file'] ?? '', modulePath);
    mode = declared ?? mode;
    if (groups !== undefined && file !== undefined) {
      addBlock(files, file, blockOf(groups));
    }
  }
  return {
    counted: mode !== 'set',
    files: new Map(
      [...files].map(([file, blocks]) => [
        file,
        [...blocks.values()].toSorted((left, right) => comparePositions(left.start, right.start)),
      ]),
    ),
  };
}

export function blockAt(blocks: readonly CoverBlock[], position: Position): CoverBlock | undefined {
  return blocks.findLast(
    ({ start, end }) =>
      comparePositions(start, position) <= 0 && comparePositions(position, end) < 0,
  );
}

export function blockStartingIn(
  blocks: readonly CoverBlock[],
  from: Position,
  to: Position,
): CoverBlock | undefined {
  return blocks.find(
    ({ start }) => comparePositions(from, start) <= 0 && comparePositions(start, to) <= 0,
  );
}
