import { normalizeGitPath } from '../git/normalize.mts';
import { parseFix } from './schema/fix-field.mts';
import { parseNotRunFields } from './schema/not-run-fields.mts';
import { parseRatchet } from './schema/ratchet-field.mts';
import {
  expandMetricEntries,
  finiteNumber,
  isRecord,
  normalizeFindingPath,
  positiveInteger,
  requiredRecord,
  requiredString,
} from './schema/values.mts';
import { withoutAnsi as untypedWithoutAnsi } from '../../../shared/messages/terminal/terminal-text.mjs';

import { problemsOf, routeFieldsOf } from './model/advice-views.mts';
import type {
  Advice,
  Anchor,
  Cause,
  CauseUnit,
  Metric,
  ParsedReport,
  TrackedFinding,
} from './model/finding-types.mts';
import type { Finding } from '../../../shared/values/findings.mts';

const withoutAnsi: (text: string) => string = untypedWithoutAnsi;

const CLASSIFICATIONS = new Set(['enforceable', 'descriptive', 'tool-error']);
const HTTP_URL = /^https?:\/\/\S+$/u;
const MODULE_IMPORT_FIELDS = new Set(['from', 'to']);

export function parseAnalyzerReport(value: unknown, analyzerName: string): ParsedReport {
  if (!(isRecord(value) && Array.isArray(value['findings']))) {
    throw new TypeError(`${analyzerName} output must contain a findings array`);
  }

  return {
    findings: expandMetricEntries(value['findings']).map((finding, index) =>
      parseFinding(finding, `${analyzerName} findings[${String(index)}]`),
    ),
    ...parseModuleImports(value['moduleImports'], `${analyzerName} moduleImports`),
  };
}

function parseModuleImports(
  value: unknown,
  context: string,
): { moduleImports?: { from: string; to: string }[] } {
  if (value === undefined) {
    return {};
  }
  if (!Array.isArray(value)) {
    throw new TypeError(`${context} must be an array`);
  }
  return {
    moduleImports: value.map((entry: unknown, index: number) => {
      const where = `${context}[${String(index)}]`;
      if (!isRecord(entry)) {
        throw new TypeError(`${where} must be an object`);
      }
      const extra = Object.keys(entry).find((key) => !MODULE_IMPORT_FIELDS.has(key));
      if (extra !== undefined) {
        throw new TypeError(`${where}.${extra} is not a supported field`);
      }
      return {
        from: normalizeFindingPath(requiredString(entry['from'], `${where}.from`), `${where}.from`),
        to: normalizeFindingPath(requiredString(entry['to'], `${where}.to`), `${where}.to`),
      };
    }),
  };
}

export function parseFinding(value: unknown, context = 'finding'): TrackedFinding {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }

  const tool = requiredString(value['tool'], `${context}.tool`);
  const rule = requiredString(value['rule'], `${context}.rule`);
  const findingPath = normalizeFindingPath(
    requiredString(value['path'], `${context}.path`),
    `${context}.path`,
  );
  const identity = requiredString(value['identity'], `${context}.identity`);
  const message = withoutAnsi(requiredString(value['message'], `${context}.message`));
  const classification = requiredString(value['classification'], `${context}.classification`);
  if (!CLASSIFICATIONS.has(classification)) {
    throw new TypeError(`${context}.classification is not supported: ${classification}`);
  }

  const finding: Finding = {
    tool,
    rule,
    path: findingPath,
    identity,
    message,
    classification,
  };

  return {
    ...finding,
    ...parseOptionalFields(value, classification, context),
    ...parseAdvice(value, message, context),
  };
}

const OPTIONAL_PARSERS: Readonly<Record<string, (value: unknown, context: string) => unknown>> = {
  symbol: requiredString,
  location: parseLocation,
  ratchet: parseRatchet,
  tokens: parseTokens,
  anchor: parseAnchor,
  helpUri: parseHelpUri,
  cause: parseCause,
  fix: parseFix,
};

function parseOptionalFields(
  value: Readonly<Record<string, unknown>>,
  classification: string,
  context: string,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [name, parse] of Object.entries(OPTIONAL_PARSERS)) {
    if (value[name] !== undefined) {
      fields[name] = parse(value[name], `${context}.${name}`);
    }
  }
  if (value['metric'] !== undefined) {
    if (classification !== 'descriptive') {
      throw new TypeError(`${context}.metric requires descriptive classification`);
    }
    fields['metric'] = parseMetric(value['metric'], `${context}.metric`);
  }
  return { ...fields, ...parseNotRunFields(value, classification, context) };
}

function parseAdvice(
  value: Readonly<Record<string, unknown>>,
  message: string,
  context: string,
): Advice {
  const advice: Advice = {
    ...(value['allowedForm'] === undefined
      ? {}
      : {
          allowedForm: requiredString(value['allowedForm'], `${context}.allowedForm`),
        }),
    ...(value['exception'] === undefined && value['exceptionList'] === undefined
      ? routeFieldsOf(message)
      : { exception: value['exception'], exceptionList: value['exceptionList'] }),
  };
  const [problem] = problemsOf({
    message,
    allowedForm: advice.allowedForm,
    exception: advice.exception,
    exceptionList: advice.exceptionList,
  });
  if (problem !== undefined) {
    throw new TypeError(
      `${context} (${String(value['tool'])} ${String(value['rule'])} in ${String(value['path'])}): ${problem}`,
    );
  }
  return advice;
}

function parseLocation(
  value: unknown,
  context: string,
): { line: number; column?: number; endLine?: number } {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  const line = positiveInteger(value['line'], `${context}.line`);
  const location: { line: number; column?: number; endLine?: number } = { line };
  if (value['column'] !== undefined) {
    location.column = positiveInteger(value['column'], `${context}.column`);
  }
  if (value['endLine'] !== undefined) {
    location.endLine = positiveInteger(value['endLine'], `${context}.endLine`);
  }
  return location;
}

function parseMetric(input: unknown, context: string): Metric {
  const value = requiredRecord(input, context);
  const metricValue = finiteNumber(value['value'], `${context}.value`);
  return {
    name: requiredString(value['name'], `${context}.name`),
    value: metricValue,
  };
}

function parseAnchor(value: unknown, context: string): Anchor {
  if (!isRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  const anchor: { key: string; requireUnchangedLine?: true } = {
    key: requiredString(value['key'], `${context}.key`),
  };
  const { requireUnchangedLine } = value;
  if (requireUnchangedLine !== undefined) {
    if (typeof requireUnchangedLine !== 'boolean') {
      throw new TypeError(`${context}.requireUnchangedLine must be a boolean`);
    }
    if (requireUnchangedLine) {
      anchor.requireUnchangedLine = true;
    }
  }
  return anchor;
}

function parseHelpUri(value: unknown, context: string): string {
  const uri = requiredString(value, context);
  if (!HTTP_URL.test(uri)) {
    throw new TypeError(`${context} must be an http or https URL`);
  }
  return uri;
}

function parseTokens(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${context} must be an array`);
  }
  return value.map((token: unknown, index: number) =>
    requiredString(token, `${context}[${String(index)}]`),
  );
}

function parseCause(value: unknown, context: string): Cause {
  if (!(isRecord(value) && Array.isArray(value['units']))) {
    throw new TypeError(`${context} must be { folders, units }`);
  }
  return {
    folders: causePaths(value['folders'], `${context}.folders`),
    units: value['units'].map((entry: unknown, index: number) =>
      parseCauseUnit(entry, `${context}.units[${String(index)}]`),
    ),
  };
}

function parseCauseUnit(entry: unknown, context: string): CauseUnit {
  if (!isRecord(entry)) {
    throw new TypeError(`${context} must be { unit, folders, files, count }`);
  }
  return {
    unit: requiredString(entry['unit'], `${context}.unit`),
    folders: causePaths(entry['folders'], `${context}.folders`),
    files: causePaths(entry['files'], `${context}.files`),
    count: positiveInteger(entry['count'], `${context}.count`),
  };
}

function causePaths(value: unknown, context: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${context} must be an array of paths`);
  }
  return value.map((file: unknown, index: number) =>
    normalizeGitPath(requiredString(file, `${context}[${String(index)}]`)),
  );
}
