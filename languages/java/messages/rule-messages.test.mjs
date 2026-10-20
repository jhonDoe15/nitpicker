import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../adapters/java-analyzer.mjs';
import {
  CATALOG_TOOLS,
  applyRuleMessages,
  checkstyleRuleName,
  readCatalog,
  withRuleMessage,
} from './rule-messages.mjs';

const FILE = 'src/main/java/demo/Cli.java';

const finding = (tool, rule, message, classification = 'enforceable') => ({
  tool,
  rule,
  path: FILE,
  identity: 'id',
  message,
  classification,
});

const hint = (rule) =>
  `If this is intended, add {"rule":"${rule}","paths":["${FILE}"],"reason":"..."} to "exceptions" in nitpicker.config.json.`;

const NOT_YOUR_FORMATTER =
  'Not your formatter: pin "conventions.java.formatter" to "google", "palantir" or "none" in nitpicker.config.json.';

describe('checkstyleRuleName', () => {
  it('shortens check classes to the module name and keeps configured ids', () => {
    expect(
      [
        'com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck',
        'com.puppycrawl.tools.checkstyle.checks.UpperEllCheck',
        'RightCurlySame',
        'com.example.checks.HouseRuleCheck',
      ].map(checkstyleRuleName),
    ).toEqual(['Indentation', 'UpperEll', 'RightCurlySame', 'com.example.checks.HouseRuleCheck']);
  });
});

describe('withRuleMessage', () => {
  it('adds the fix and the exception route to a rule that can hit intended code', () => {
    expect(withRuleMessage(finding('pmd', 'SystemPrintln', 'Usage of System.out/err'))).toEqual(
      finding(
        'pmd',
        'SystemPrintln',
        `Usage of System.out/err. ${readCatalog('pmd').SystemPrintln.fix} ${hint('pmd/SystemPrintln')}`,
      ),
    );
  });

  it('adds only the fix to a rule whose finding is always a defect', () => {
    const message = 'Possible null pointer dereference of value';

    expect(withRuleMessage(finding('spotbugs', 'NP_NULL_ON_SOME_PATH', message)).message).toBe(
      `${message}. ${readCatalog('spotbugs').NP_NULL_ON_SOME_PATH.fix}`,
    );
  });

  it('points layout findings at the formatter under the short Checkstyle name', () => {
    const source = 'com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck';
    const message = "'method def' has incorrect indentation level 4, expected level should be 2.";

    const fix = (options) =>
      withRuleMessage(finding('checkstyle', source, message), options).message;

    expect(fix({ javaStyle: 'google' })).toBe(
      `${message} Run google-java-format on the file; it fixes this layout. ${NOT_YOUR_FORMATTER}`,
    );
    expect(fix({ javaStyle: 'aosp' })).toBe(
      `${message} Run google-java-format --aosp on the file; it fixes this layout. ${NOT_YOUR_FORMATTER}`,
    );
    expect(fix({ javaStyle: 'palantir' })).toBe(
      `${message} Run palantir-java-format on the file; it fixes this layout. ${NOT_YOUR_FORMATTER}`,
    );
    expect(fix({ javaStyle: 'none' })).toBe(
      `${message} Fix this layout by hand; no Java formatter runs.`,
    );
    expect(fix({})).toBe(
      `${message} Run your Java formatter on the file; it fixes this layout. ${NOT_YOUR_FORMATTER}`,
    );
  });

  it('gives a rule the catalog does not know the exception route alone', () => {
    expect(withRuleMessage(finding('checkstyle', 'HouseRule', 'No.')).message).toBe(
      `No. ${hint('checkstyle/HouseRule')}`,
    );
  });

  it('offers no exception outside the java preset, whose exceptions cannot lift these tools', () => {
    expect(
      withRuleMessage(finding('pmd', 'SystemPrintln', 'Usage of System.out/err'), {
        preset: 'kotlin',
      }).message,
    ).toBe(`Usage of System.out/err. ${readCatalog('pmd').SystemPrintln.fix}`);
  });

  it('offers no exception for a descriptive finding', () => {
    expect(
      withRuleMessage(finding('pmd', 'SystemPrintln', 'Usage of System.out/err', 'descriptive'))
        .message,
    ).toBe(`Usage of System.out/err. ${readCatalog('pmd').SystemPrintln.fix}`);
  });

  it('keeps messages that already name the config file, and findings of other tools', () => {
    const spring = finding(
      'pmd',
      'SpringConstructorInjection',
      'Inject through the constructor. If it is right here, add an exception for pmd/SpringConstructorInjection in nitpicker.config.json.',
    );
    const pit = finding('pit', 'mutant-survived', 'Survived');

    expect(applyRuleMessages([spring, pit])).toEqual([spring, pit]);
  });
});

describe('rule catalogs', () => {
  it('hold one short fix sentence or null and an intent flag per rule', () => {
    const malformed = CATALOG_TOOLS.flatMap((tool) =>
      Object.entries(readCatalog(tool))
        .filter(
          ([, entry]) =>
            typeof entry.mayBeIntended !== 'boolean' ||
            (entry.fix !== null && (typeof entry.fix !== 'string' || entry.fix.length > 160)) ||
            (entry.layout !== undefined && (tool !== 'checkstyle' || entry.fix !== null)),
        )
        .map(([rule]) => `${tool}/${rule}`),
    );

    expect(malformed).toEqual([]);
  });

  it('are part of the configuration hash, with the code that applies them', () => {
    const files = readdirSync(import.meta.dirname)
      .filter((name) => !name.includes('.test.'))
      .map((name) => `languages/java/messages/${name}`)
      .sort();

    expect(configurationFiles().filter((file) => files.includes(file))).toEqual(files);
  });
});
