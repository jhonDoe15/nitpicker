import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type CheckstyleRow = {
  readonly file: string;
  readonly source: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
};

const ENTITY = /^&(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);/u;
const SPECIAL: Readonly<Record<string, string>> = {
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};
const REPORT_END = '</checkstyle>';
const REPORT_START = /<checkstyle\b[^>]*>/u;

export function escaped(text: string): string {
  let result = '';
  for (let at = 0; at < text.length; at += 1) {
    const character = text.charAt(at);
    const code = character.charCodeAt(0);
    if (character === '&') {
      result += ENTITY.test(text.slice(at)) ? '&' : '&amp;';
    } else if (SPECIAL[character] !== undefined) {
      result += SPECIAL[character];
    } else if (character === '\n') {
      result += '&#10;';
    } else if (character === '\r') {
      continue;
    } else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      result += `&#x${code.toString(16)};`;
    } else {
      result += character;
    }
  }
  return result;
}

function errorElement({ line, column, message, source }: CheckstyleRow): string {
  const at = column > 0 ? ` column="${String(column)}"` : '';
  return (
    `<error line="${String(line)}"${at} severity="warning" message="${escaped(message)}"` +
    ` source="${escaped(source)}"/>`
  );
}

export function fileElements(files: readonly string[], rows: readonly CheckstyleRow[]): string {
  const byFile = new Map<string, CheckstyleRow[]>();
  for (const row of rows) {
    const listed = byFile.get(row.file);
    if (listed === undefined) {
      byFile.set(row.file, [row]);
    } else {
      listed.push(row);
    }
  }
  return files
    .map((file) =>
      [
        `<file name="${escaped(file)}">`,
        ...(byFile.get(file) ?? []).map(errorElement),
        '</file>',
      ].join('\n'),
    )
    .join('\n');
}

export function checkstyleXml(version: string, body: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<checkstyle version="${version}">`,
    ...(body === '' ? [] : [body]),
    REPORT_END,
    '',
  ].join('\n');
}

export function reportBody(xml: string): string {
  const start = REPORT_START.exec(xml);
  const end = xml.lastIndexOf(REPORT_END);
  if (start === null || end < start.index) {
    throw new Error('the Checkstyle report has no <checkstyle> element');
  }
  return xml.slice(start.index + start[0].length, end).trim();
}

export function mergeReports(report: string, engineReport: string): void {
  if (!existsSync(report)) {
    return;
  }
  const own = readFileSync(report, 'utf8');
  const body = reportBody(readFileSync(engineReport, 'utf8'));
  const end = own.lastIndexOf(REPORT_END);
  if (body === '' || !REPORT_START.test(own) || end < 0) {
    return;
  }
  writeFileSync(report, `${own.slice(0, end)}${body}\n${own.slice(end)}`);
}
