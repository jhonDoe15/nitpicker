import { readFileSync } from 'node:fs';
import { sharedFactFindings } from '../evaluate.mjs';
import { FACT_RULE_LANGUAGES } from '../../../project-rules/fact-rules.mjs';

export function factFixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
}

export function findingsOf(facts, rules, options = {}) {
  return sharedFactFindings(facts, {
    language: 'typescript',
    analyzerName: 'facts',
    rules,
    ...options,
  });
}

export function fixtureFindings(name, rules, options = {}) {
  return findingsOf(factFixture(name), rules, options);
}

export function rows(findings) {
  return findings.map(({ rule, path, identity }) => [rule, path, identity]);
}

export function exception(rule, path) {
  return { rule, paths: [path], reason: 'test' };
}

export function withLanguageRegistered(rule, language, run) {
  const before = FACT_RULE_LANGUAGES[rule][language];
  FACT_RULE_LANGUAGES[rule][language] = true;
  try {
    return run();
  } finally {
    FACT_RULE_LANGUAGES[rule][language] = before;
  }
}
