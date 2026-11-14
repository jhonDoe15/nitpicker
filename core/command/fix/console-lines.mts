import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CONSOLE_LINE_LIMIT = 20;
export const FIX_LOG_FILE = 'fix.log';

export type Section = {
  readonly heading: string;
  readonly lines: readonly string[];
  readonly indent?: string;
};

export function cappedLines(lines: readonly string[], seeFile: string): readonly string[] {
  return lines.length <= CONSOLE_LINE_LIMIT
    ? lines
    : [
        ...lines.slice(0, CONSOLE_LINE_LIMIT),
        `... and ${String(lines.length - CONSOLE_LINE_LIMIT)} more, see ${seeFile}`,
      ];
}

function body({ lines, indent = '  ' }: Section, shown: readonly string[]): string {
  return lines.length === 0 ? '' : shown.map((line) => `${indent}${line}\n`).join('');
}

export function sectionText(section: Section, seeFile: string): string {
  return section.lines.length === 0
    ? ''
    : `${section.heading}:\n${body(section, cappedLines(section.lines, seeFile))}`;
}

export function writeFixLog(outputRoot: string, sections: readonly Section[]): void {
  const logFile = path.join(outputRoot, FIX_LOG_FILE);
  if (sections.every(({ lines }) => lines.length <= CONSOLE_LINE_LIMIT)) {
    rmSync(logFile, { force: true });
    return;
  }
  mkdirSync(outputRoot, { recursive: true });
  const text = sections
    .filter(({ lines }) => lines.length > 0)
    .map((section) => `${section.heading}:\n${body(section, section.lines)}`);
  writeFileSync(logFile, text.join(''));
}
