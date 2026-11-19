import { replacing } from '../../../../support/ranges.mts';
import { allOf } from '../../../../edits/plans.mts';
import { prismaInsert } from './prisma-insert.mts';
import { typeormInsert } from './typeorm-insert.mts';
import { chunkedLoop, type WriteSite, type WriteSuggestion } from '../write-loop.mts';

const INSERT_CHUNK = 100;

export function insertSuggestion(site: WriteSite): WriteSuggestion | undefined {
  const insertion = site.orm.orm === 'typeorm' ? typeormInsert(site) : prismaInsert(site);
  if (insertion === undefined) {
    return undefined;
  }
  const block = chunkedLoop(site, {
    source: site.context.sourceCode.getText(site.loop.iterable),
    size: INSERT_CHUNK,
    prelude: [],
    statement: (part) => `await ${insertion.callText(part)};`,
  });
  const plan = block === undefined ? undefined : allOf([replacing(site.statement.range, block)]);
  return plan === undefined ? undefined : { messageId: 'batchInsert', plan };
}
