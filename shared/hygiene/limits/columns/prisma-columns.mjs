import { makeFact } from '../scanning/facts.mjs';

const MODEL = /^\s*model\s+(\w+)\s*\{/u;
const FIELD = /^\s*(\w+)\s+String\b[^\n]*@db\.(?:VarChar|Char)\(\s*(\d+)\s*\)/u;
const MAP = /@map\(\s*"(\w+)"\s*\)/u;
const MODEL_MAP = /@@map\(\s*"(\w+)"\s*\)/u;
const BLOCK_END = /^\s*\}/u;

function blocksOf(lines) {
  return lines.flatMap((line, start) => {
    const model = MODEL.exec(line);
    if (model === null) {
      return [];
    }
    const length = lines.slice(start + 1).findIndex((next) => BLOCK_END.test(next));
    const end = length === -1 ? lines.length : start + 1 + length;
    return [{ name: model[1], start, body: lines.slice(start + 1, end) }];
  });
}

function blockFacts(file, block) {
  const table = MODEL_MAP.exec(block.body.join('\n'))?.[1];
  return block.body.flatMap((line, offset) => {
    const field = FIELD.exec(line);
    return field === null
      ? []
      : [
          makeFact({
            kind: 'column',
            entityNames: [block.name, table],
            fieldNames: [field[1], MAP.exec(line)?.[1]],
            label: `${block.name}.${field[1]}`,
            file,
            line: block.start + offset + 2,
            style: 'prisma',
            width: Number(field[2]),
          }),
        ];
  });
}

export function prismaColumnFacts(file, text) {
  return blocksOf(text.split('\n')).flatMap((block) => blockFacts(file, block));
}
