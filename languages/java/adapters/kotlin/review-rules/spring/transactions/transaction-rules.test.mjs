import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findingFactory } from '../../review-finding.mjs';
import { springFindings } from '../spring-findings.mjs';
import { REPOSITORY_WRITES, WRITE_VERB } from './writes.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures');
const PROJECT = path.join(FIXTURES, 'kotlin-spring-project');
const RULESET = path.resolve(import.meta.dirname, '../../../../../gradle/spring-ruleset.xml');
const { files } = JSON.parse(readFileSync(path.join(FIXTURES, 'kotlin-spring-facts.json'), 'utf8'));
const RULES = new Set([
  'SpringDataWriteWithoutTransaction',
  'SpringMultiWriteWithoutTransaction',
  'SpringCacheWriteInTransaction',
  'SpringLocalCacheWriteInTransaction',
  'SpringDataDerivedQuery',
]);
const RULE_BODY = /<rule name="(\w+)"[\s\S]*?<\/rule>/gu;

function ledger(folder) {
  return springFindings(files, {
    finding: findingFactory(),
    manifest: { spring: true },
    projectFiles: files,
    projectRoot: PROJECT,
    javaRoots: ['src/main/java'],
  })
    .filter(({ path: file, rule }) => file.endsWith(`${folder}/Ledger.kt`) && RULES.has(rule))
    .map(({ location, rule, symbol }) => `${String(location.line)} ${rule} ${symbol}`);
}

function javaRules() {
  const text = readFileSync(RULESET, 'utf8');
  return new Map(
    [...text.matchAll(RULE_BODY)].map(([body, name]) => [name, body.replaceAll(/\s+/gu, ' ')]),
  );
}

describe('Spring writes and transactions in Kotlin', () => {
  it('reports writes without a transaction and cache writes inside one', () => {
    expect(ledger('bad')).toEqual([
      '22 SpringDataWriteWithoutTransaction EntryRepository.reset',
      '24 SpringDataWriteWithoutTransaction EntryRepository.deleteByVersion',
      '24 SpringDataDerivedQuery EntryRepository.deleteByVersion',
      '26 SpringDataWriteWithoutTransaction EntryRepository.removeAllByVersion',
      '26 SpringDataDerivedQuery EntryRepository.removeAllByVersion',
      '30 SpringDataDerivedQuery EntryNotes.deleteByVersion',
      '40 SpringMultiWriteWithoutTransaction EntryService.move',
      '45 SpringMultiWriteWithoutTransaction EntryService.replace',
      '50 SpringMultiWriteWithoutTransaction EntryService.settle',
      '55 SpringMultiWriteWithoutTransaction EntryService.purge',
      '76 SpringCacheWriteInTransaction EntryCache.reprice.put',
      '77 SpringCacheWriteInTransaction EntryCache.reprice.evict',
      '81 SpringLocalCacheWriteInTransaction EntryCache.remember.put',
      '82 SpringLocalCacheWriteInTransaction EntryCache.remember.remove',
      '83 SpringLocalCacheWriteInTransaction EntryCache.remember.set',
      '85 SpringLocalCacheWriteInTransaction EntryCache.remember.putIfAbsent',
      '86 SpringLocalCacheWriteInTransaction EntryCache.remember.getOrPut',
      '91 SpringCacheWriteInTransaction EntryCache.refresh',
      '94 SpringLocalCacheWriteInTransaction EntryCache.note.invalidate',
      '107 SpringLocalCacheWriteInTransaction EntryJobs.run.invalidate',
    ]);
  });

  it('passes transactional, either-or, after-commit and read-only forms', () => {
    expect(ledger('good')).toEqual([]);
  });

  it('shares one write list with the Java rules', () => {
    const quoted = REPOSITORY_WRITES.map((name) => `'${name}'`).join(', ');
    const verb = WRITE_VERB.source.replace('(?:', '(');
    const rules = javaRules();
    const users = [
      'SpringTransactionalReadOnlyWrite',
      'SpringMultiWriteWithoutTransaction',
      'SpringLocalCacheWriteInTransaction',
    ];

    expect(users.filter((name) => !rules.get(name).includes(quoted))).toEqual([]);
    expect(users.filter((name) => !rules.get(name).includes(`'${verb}'`))).toEqual([]);
  });
});
