import { readFileSync } from 'node:fs';
import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { JVM_ANALYZERS, JVM_BUILDS } from './catalog-rules.mjs';
import { readToolText } from './tool-text/tool-text.mjs';
import { flatText } from '../../../shared/reference/build/text.mjs';

const CHECKS_FILE = new URL('../gradle/errorprone/checks.json', import.meta.url);
const BUG_PATTERNS_URL = 'https://errorprone.info/bugpattern';
const GUIDE = {
  label: 'Java preset guide',
  path: 'docs/java-preset.md',
  anchor: 'error-prone-and-nullaway',
};

const SEVERITY_WHY = {
  ERROR:
    'Error Prone rates this check an error: the code it flags is almost certainly a bug. The preset compiles the main and test sources a second time with Error Prone and reports it.',
  WARNING:
    'Error Prone rates this check a warning: the code it flags is likely a mistake or has a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.',
  SUGGESTION:
    'Error Prone rates this check a suggestion: it names a clearer form. The preset compiles the main and test sources a second time with Error Prone and reports it.',
};
const TURNED_ON = ' Error Prone has it off by default; nitpicker turns it on.';
const CERTAIN_BUG =
  'The message of a finding in main sources gives no exception route, because the flagged code is a bug; an entry still lifts it if a reviewer agrees. A finding in test sources keeps the route.';
const NULLAWAY_ALLOWED =
  "Annotate a field, parameter or return value that may be null with the @Nullable the project already uses (JSpecify's org.jspecify.annotations.Nullable when it uses none) and check it before use, or give a non-null value.";

function readChecks() {
  return JSON.parse(readFileSync(CHECKS_FILE, 'utf8'));
}

function scopeOf(name, checks) {
  const exempt = checks.classExemptions[name];
  const notes = [
    ...(exempt === undefined ? [] : [`Not reported in classes annotated ${exempt.join(', ')}.`]),
    ...(checks.lombokUnsuppressedOff.includes(name) ? ['Off in a project that uses Lombok.'] : []),
  ];
  return notes.length === 0 ? undefined : notes.join(' ');
}

function checkText(name, texts) {
  const text = texts.rules[name];
  if (text === undefined) {
    throw new Error(`The Error Prone ${texts.version} snapshot has no check ${name}`);
  }
  return text;
}

function checkEntry(name, checks, texts) {
  const scope = scopeOf(name, checks);
  const text = checkText(name, texts);
  return ruleEntry({
    tool: 'errorprone',
    rule: name,
    page: 'java-errorprone',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    summary: flatText(text.summary),
    why: `${SEVERITY_WHY[text.severity]}${checks.enable.includes(name) ? TURNED_ON : ''}`,
    ...(scope === undefined ? {} : { scope }),
    links: [{ label: 'Error Prone bug pattern', url: text.url || `${BUG_PATTERNS_URL}/${name}` }],
    docs: [GUIDE],
    exception: {
      key: 'exceptions',
      rule: `errorprone/${name}`,
      ...(checks.certainBugs.includes(name) ? { note: CERTAIN_BUG } : {}),
    },
  });
}

function nullAwayEntry() {
  return ruleEntry({
    tool: 'errorprone',
    rule: 'NullAway',
    page: 'java-errorprone',
    analyzers: JVM_ANALYZERS,
    builds: JVM_BUILDS,
    summary: flatText(readToolText('errorprone').rules.NullAway.summary),
    why: 'NullAway is an Error Prone plugin: the main packages of the project are non-null unless marked, so a null that reaches a place that does not allow it is a finding.',
    allowed: NULLAWAY_ALLOWED,
    scope: 'Main sources only; off in a project without main classes in a named package.',
    links: [{ label: 'NullAway', url: 'https://github.com/uber/NullAway' }],
    docs: [GUIDE],
    exception: { key: 'exceptions', rule: 'errorprone/NullAway' },
  });
}

/** The entries of the Error Prone checks the preset reports, and of NullAway. */
export function errorProneEntries() {
  const checks = readChecks();
  const texts = readToolText('errorprone');
  const off = new Set([...checks.disable, ...checks.defaultOff]);
  return [
    ...checks.reviewedChecks
      .filter((name) => !off.has(name))
      .map((name) => checkEntry(name, checks, texts)),
    nullAwayEntry(),
  ];
}
