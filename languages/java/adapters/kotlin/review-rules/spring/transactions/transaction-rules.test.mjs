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

function javaRules({ raw = false } = {}) {
  const text = readFileSync(RULESET, 'utf8');
  return new Map(
    [...text.matchAll(RULE_BODY)].map(([body, name]) => [
      name,
      raw ? body : body.replaceAll(/\s+/gu, ' '),
    ]),
  );
}

function definition(body, name) {
  return new RegExp(String.raw`\$${name} := (function\([\s\S]*?\n\})`, 'u').exec(body)?.[1];
}

describe('Spring writes and transactions in Kotlin', () => {
  it('reports writes without a transaction and cache writes inside one', () => {
    expect(ledger('bad')).toEqual([
      '25 SpringDataWriteWithoutTransaction EntryRepository.reset',
      '27 SpringDataWriteWithoutTransaction EntryRepository.deleteByVersion',
      '27 SpringDataDerivedQuery EntryRepository.deleteByVersion',
      '29 SpringDataWriteWithoutTransaction EntryRepository.removeAllByVersion',
      '29 SpringDataDerivedQuery EntryRepository.removeAllByVersion',
      '33 SpringDataDerivedQuery EntryNotes.deleteByVersion',
      '44 SpringMultiWriteWithoutTransaction EntryService.move',
      '49 SpringMultiWriteWithoutTransaction EntryService.replace',
      '54 SpringMultiWriteWithoutTransaction EntryService.settle',
      '59 SpringMultiWriteWithoutTransaction EntryService.purge',
      '64 SpringMultiWriteWithoutTransaction EntryService.tidy',
      '72 SpringMultiWriteWithoutTransaction EntryService.forgetBoth',
      '77 SpringMultiWriteWithoutTransaction EntryService.expire',
      '99 SpringCacheWriteInTransaction EntryCache.reprice.put',
      '100 SpringCacheWriteInTransaction EntryCache.reprice.evict',
      '104 SpringLocalCacheWriteInTransaction EntryCache.remember.put',
      '105 SpringLocalCacheWriteInTransaction EntryCache.remember.remove',
      '106 SpringLocalCacheWriteInTransaction EntryCache.remember.set',
      '108 SpringLocalCacheWriteInTransaction EntryCache.remember.putIfAbsent',
      '109 SpringLocalCacheWriteInTransaction EntryCache.remember.getOrPut',
      '110 SpringLocalCacheWriteInTransaction EntryCache.remember.set',
      '111 SpringLocalCacheWriteInTransaction EntryCache.remember.putAll',
      '112 SpringLocalCacheWriteInTransaction EntryCache.remember.invalidateAll',
      '113 SpringCacheWriteInTransaction EntryCache.remember.evict',
      '118 SpringCacheWriteInTransaction EntryCache.refresh',
      '121 SpringCacheWriteInTransaction EntryCache.rename',
      '124 SpringLocalCacheWriteInTransaction EntryCache.note.invalidate',
      '137 SpringLocalCacheWriteInTransaction EntryJobs.run.invalidate',
    ]);
  });

  it('passes transactional, either-or, after-commit and read-only forms', () => {
    expect(ledger('good')).toEqual([]);
  });

  it('shares one write list with the Java rules', () => {
    const quoted = REPOSITORY_WRITES.map((name) => `'${name}'`).join(', ');
    const verb = WRITE_VERB.source.replaceAll('(?:', '(');
    const rules = javaRules();
    const users = [
      'SpringTransactionalReadOnlyWrite',
      'SpringMultiWriteWithoutTransaction',
      'SpringLocalCacheWriteInTransaction',
    ];

    expect(users.filter((name) => !rules.get(name).includes(quoted))).toEqual([]);
    expect(
      [...users, 'SpringDataRowWriteInLoop'].filter(
        (name) => !rules.get(name).includes(`'${verb}'`),
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'write',
      [
        'SpringTransactionalReadOnlyWrite',
        'SpringMultiWriteWithoutTransaction',
        'SpringLocalCacheWriteInTransaction',
      ],
    ],
    ...['writing', 'runsInTransaction', 'inTransaction'].map((name) => [
      name,
      ['SpringCacheWriteInTransaction', 'SpringLocalCacheWriteInTransaction'],
    ]),
  ])('keeps the Java $%s function the same in every rule that copies it', (name, users) => {
    const rules = javaRules({ raw: true });
    const copies = users.map((rule) => definition(rules.get(rule), name));

    expect(copies.map((copy) => copy?.startsWith('function('))).toEqual(users.map(() => true));
    expect(new Set(copies).size).toBe(1);
  });
});
