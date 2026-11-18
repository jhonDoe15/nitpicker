import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../../java-analyzer.mts';
import { ALLOWED_FORM_FIRST } from '../test-support/allowed-form.mts';
import { withRuleMessage as withMessageUntyped } from '../../../messages/rule-messages.mjs';
import {
  guidePages as guidePagesUntyped,
  guideText as guideTextUntyped,
} from '../../../../../shared/reference/build/guide-pages.mjs';
import { textOf } from '../../../../../shared/values/readers.mts';

type RuleEntry = { readonly name: string; readonly message: string };

const withRuleMessage: (finding: object) => { allowedForm: string; message: string } =
  withMessageUntyped;
const guidePages: (file: string) => unknown[] = guidePagesUntyped;
const guideText: (page: unknown) => string = guideTextUntyped;

const root = path.resolve(import.meta.dirname, '../../../../..');
const ruleset = readFileSync(path.join(root, 'languages/java/gradle/spring-ruleset.xml'), 'utf8');
const docs = guidePages('docs/java-preset.md').map(guideText).join('\n');
const mainRuleset = readFileSync(
  path.join(root, 'languages/java/gradle/pmd-main-ruleset.xml'),
  'utf8',
);
const testRuleset = readFileSync(
  path.join(root, 'languages/java/gradle/spring-test-ruleset.xml'),
  'utf8',
);
const RULE = /<rule name="(?<name>[A-Za-z]+)"[^>]*?\smessage="(?<message>[^"]*)"/g;
function ruleOf({ groups }: RegExpMatchArray): RuleEntry {
  return { name: textOf(groups?.['name']), message: textOf(groups?.['message']) };
}
const rules = [...ruleset.matchAll(RULE)].map(ruleOf);
const testRules = [...testRuleset.matchAll(RULE)].map(ruleOf);
const PMD_RULESETS = [
  'pmd-ruleset.xml',
  'pmd-main-ruleset.xml',
  'pmd-test-ruleset.xml',
  'spring-ruleset.xml',
  'spring-test-ruleset.xml',
];
const XPATH = /<!\[CDATA\[\n(?<xpath>[\s\S]*?)\]\]>/u;
const FLUSH_FILTER = '\n  [not(';
const RETURN = '\nreturn (\n';
const CHUNK_FILTER = '\n    [not($chunkUpdate(.))]';
const LOOP_FILTER = ')[$loop(.)]\n|\n';
function xpathOf(text: string, name: string): string {
  const match = XPATH.exec(text.slice(text.indexOf(`<rule name="${name}"`)));
  return textOf(match?.groups?.['xpath']).trimEnd();
}
const JAKARTA_TYPE = /'jakarta\.(?<type>[\w.]+)'/g;

describe('spring-ruleset.xml', () => {
  it('is part of the Java analyzer cache key', () => {
    expect(configurationFiles().filter((file) => file.endsWith('spring-ruleset.xml'))).toEqual([
      'languages/java/gradle/spring-ruleset.xml',
    ]);
  });

  it('declares every rule with a unique name and a message', () => {
    const names = rules.map(({ name }) => name);

    expect(names.length).toBeGreaterThan(40);
    expect(new Set(names).size).toBe(names.length);
    expect(ruleset.match(/<rule name=/g)).toHaveLength(names.length);
  });

  it('leaves to the Spring rules exactly the writes, flushes and row writes they report', () => {
    const ioCallInLoop = xpathOf(mainRuleset, 'IoCallInLoop');
    const flushes = xpathOf(ruleset, 'SpringDataNoFlush');
    const rows = xpathOf(ruleset, 'SpringDataRowWriteInLoop');
    const [bindings = '', report = ''] = rows.split(RETURN);
    const [updates = '', references = ''] = report.split(CHUNK_FILTER);
    const [, methodReferences = ''] = references.split(LOOP_FILTER);

    expect({
      writes: ioCallInLoop.includes(xpathOf(ruleset, 'SpringDataNoSaveInLoop')),
      flushes: ioCallInLoop.includes(flushes.slice(0, flushes.indexOf(FLUSH_FILTER))),
      rowBindings: ioCallInLoop.includes(bindings),
      rowUpdates: ioCallInLoop.includes(updates),
      rowReferences: ioCallInLoop.includes(methodReferences.trim()),
    }).toEqual({
      writes: true,
      flushes: true,
      rowBindings: true,
      rowUpdates: true,
      rowReferences: true,
    });
  });

  it('leaves the exception route to the gate, which adds the shared sentence', () => {
    const handWritten = rules
      .filter(({ message }) => /nitpicker\.config|add an exception|"exceptions"/u.test(message))
      .map(({ name }) => name);

    expect(handWritten).toEqual([]);
  });

  it('leads every message with the allowed form, never with a prohibition or the problem', () => {
    expect(
      [...rules, ...testRules]
        .filter(({ message }) => !ALLOWED_FORM_FIRST.test(message))
        .map(({ name }) => name),
    ).toEqual([]);
  });

  it('gives each test-source rule the first sentence of its message as the allowed form', () => {
    const forms = testRules.map(({ name, message }) => {
      const finding = withRuleMessage({
        tool: 'pmd',
        rule: name,
        path: 'src/test/java/demo/SampleTest.java',
        message,
        classification: 'enforceable',
      });
      return [name, finding.allowedForm, finding.message.startsWith(finding.allowedForm)];
    });

    expect(forms).toEqual(
      testRules.map(({ name, message }) => [name, `${textOf(message.split('. ')[0])}.`, true]),
    );
  });

  it('keeps braces out of messages, which PMD formats as patterns', () => {
    expect(rules.filter(({ message }) => /[{}]/.test(message)).map(({ name }) => name)).toEqual([]);
  });

  it.each(PMD_RULESETS)('matches each jakarta type with its javax twin in %s', (name) => {
    const text = readFileSync(path.join(root, 'languages/java/gradle', name), 'utf8');
    const unpaired = [...text.matchAll(JAKARTA_TYPE)]
      .map(({ groups }) => textOf(groups?.['type']))
      .filter((type) => !text.includes(`'javax.${type}'`));

    expect(unpaired).toEqual([]);
  });

  it('lists every rule in the Java preset docs', () => {
    const undocumented = rules
      .map(({ name }) => name)
      .filter((name) => !docs.includes(`\`${name}\``));

    expect(undocumented).toEqual([]);
  });
});
