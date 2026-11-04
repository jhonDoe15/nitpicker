import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../java-analyzer.mjs';
import {
  BLOCKING_REPOSITORIES,
  EVERY,
  EVIDENCE_CALLS,
  MEMBER_CALLS,
  STATIC_CALLS,
} from '../kotlin/review-rules/blocking/blocking-catalog.mjs';
import { ALLOWED_FORM_FIRST } from '../spring/test-support/allowed-form.mjs';

const root = path.resolve(import.meta.dirname, '../../../..');
const ruleset = readFileSync(path.join(root, 'languages/java/gradle/reactor-ruleset.xml'), 'utf8');
const docs = readFileSync(path.join(root, 'docs/java-preset.md'), 'utf8');
const RULE = /<rule name="(?<name>[A-Za-z]+)"[^>]*?\smessage="(?<message>[^"]*)"/g;
const rules = [...ruleset.matchAll(RULE)].map(({ groups }) => groups);
const blockingBody = ruleset.slice(
  ruleset.indexOf('$blocking := function'),
  ruleset.indexOf('$parallel := function'),
);
const alternatives = blockingBody.split(/\n {10}or /u);
const REPOSITORY = /data\.repository\./u;
const KOTLIN_ONLY_STATIC = [];
const JAVA_ONLY_STATIC = ['java.lang.Thread#sleep'];

function quoted(text) {
  return [...text.matchAll(/'([^']+)'/gu)].map(([, value]) => value);
}

function javaMemberCalls() {
  return alternatives
    .filter(
      (part) => part.includes('typeIs(') && !REPOSITORY.test(part) && !part.includes('$reactive'),
    )
    .flatMap((part) => {
      const types = [...part.matchAll(/typeIs\('([^']+)'\)/gu)].map(([, type]) => type);
      const named = /^\(@MethodName = \(([^)]*)\)/u.exec(part.trim());
      const names = named === null ? ['*'] : quoted(named[1]);
      return types.flatMap((type) => names.map((name) => `${type}#${name}`));
    })
    .sort();
}

function kotlinMemberCalls() {
  return MEMBER_CALLS.filter(({ requires }) => requires === undefined)
    .flatMap(({ types, names }) =>
      types.flatMap((type) =>
        names === EVERY ? [`${type}#*`] : names.map((name) => `${type}#${name}`),
      ),
    )
    .sort();
}

function javaStaticCalls() {
  return [...blockingBody.matchAll(/matchesSig\('([^#]+)#(\w+)\(_\*\)'\)/gu)]
    .map(([, owner, name]) => `${owner}#${name === '_' ? '*' : name}`)
    .sort();
}

function kotlinStaticCalls() {
  return STATIC_CALLS.flatMap(({ owners, names }) =>
    owners.flatMap((owner) =>
      names === EVERY ? [`${owner}#*`] : names.map((name) => `${owner}#${name}`),
    ),
  ).sort();
}

describe('reactor-ruleset.xml', () => {
  it('is part of the Java analyzer cache key', () => {
    expect(configurationFiles().filter((file) => file.endsWith('reactor-ruleset.xml'))).toEqual([
      'languages/java/gradle/reactor-ruleset.xml',
    ]);
  });

  it('declares the two Reactor rules, each with a unique name', () => {
    expect(rules.map(({ name }) => name)).toEqual([
      'ReactorBlockingInOperator',
      'ReactorBlockInReactiveMethod',
    ]);
    expect(ruleset.match(/<rule name=/g)).toHaveLength(rules.length);
  });

  it('leads every message with the allowed form and leaves the exception route to the gate', () => {
    expect(rules.filter(({ message }) => !ALLOWED_FORM_FIRST.test(message))).toEqual([]);
    expect(rules.filter(({ message }) => /nitpicker\.config|"exceptions"/u.test(message))).toEqual(
      [],
    );
    expect(rules.filter(({ message }) => /[{}]/u.test(message))).toEqual([]);
  });

  it('closes every message attribute once', () => {
    expect(ruleset.match(/message="[^"]*">/gu)).toHaveLength(rules.length);
    expect(ruleset.includes('""')).toBe(false);
  });

  it('names the offloading scheduler in the operator rule', () => {
    expect(rules.map(({ message }) => message.includes('Schedulers.boundedElastic()'))).toEqual([
      true,
      false,
    ]);
  });

  it('lists every rule in the Java preset docs', () => {
    expect(rules.filter(({ name }) => !docs.includes(`\`${name}\``))).toEqual([]);
  });
});

describe('the blocking calls of the Reactor rule and of the Kotlin coroutine rule', () => {
  it('name the same member calls, except the Kotlin-only extension functions', () => {
    expect(javaMemberCalls()).toEqual(kotlinMemberCalls());
  });

  it('name the same static calls, except Thread.sleep, which detekt reports in Kotlin', () => {
    expect(javaStaticCalls()).toEqual(
      [
        ...kotlinStaticCalls().filter((call) => !KOTLIN_ONLY_STATIC.includes(call)),
        ...JAVA_ONLY_STATIC,
      ].sort(),
    );
  });

  it('name the same block calls on Mono and Flux', () => {
    const block = alternatives.find((part) => part.includes('$reactive'));
    const kotlin = EVIDENCE_CALLS.find(({ imports }) => imports.includes('reactor.core.'));

    expect(quoted(/@MethodName = \(([^)]*)\)/u.exec(block)[1])).toEqual(kotlin.names);
  });

  it('cover the Spring Data repositories the Kotlin rule treats as blocking', () => {
    const repositories = alternatives.find((part) => REPOSITORY.test(part));
    const java = [...repositories.matchAll(/typeIs\('([^']+)'\)/gu)].map(([, type]) => type);

    expect(java.filter((type) => !BLOCKING_REPOSITORIES.has(type))).toEqual([]);
    expect(java).toEqual([
      'org.springframework.data.repository.Repository',
      'org.springframework.data.repository.query.QueryByExampleExecutor',
    ]);
  });
});
