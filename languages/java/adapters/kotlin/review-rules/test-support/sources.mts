import { lineOf } from '../../scan/kotlin-source.mjs';
import { scanTestFile } from '../tests/discovery/test-units.mjs';
import { projectFlags } from '../tests/project-flags.mjs';
import { fileReports } from '../tests/test-honesty.mjs';

const scan: (text: string, assertionNames?: string[]) => unknown = scanTestFile;
const flagsOf: (units: { scanned: unknown }[]) => unknown = projectFlags;
const reportsOf: (scanned: unknown, flags: unknown) => Omit<Report, 'line'>[] = fileReports;
const lineAt: (scanned: unknown, offset: number) => number = lineOf;

type Report = {
  rule: string;
  symbol: string;
  offset: number;
  line: number;
};

export function flagsFor(texts: string[]): unknown {
  return flagsOf(texts.map((text) => ({ scanned: scan(text) })));
}

function reportsFor(
  text: string,
  flags: unknown = flagsFor([text]),
  assertionNames: string[] = [],
): Report[] {
  const scanned = scan(text, assertionNames);
  return reportsOf(scanned, flags).map((report) => ({
    ...report,
    line: lineAt(scanned, report.offset),
  }));
}

export function summaryOf(text: string, flags?: unknown): string[] {
  return reportsFor(text, flags).map(({ rule, symbol }) => `${rule} ${symbol}`);
}

export function rulesOf(
  text: string,
  rule: string,
  flags?: unknown,
  assertionNames?: string[],
): string[] {
  return reportsFor(text, flags, assertionNames)
    .filter((report) => report.rule === rule)
    .map(({ symbol, line }) => `${symbol}@${String(line)}`);
}

export const JUNIT_HEAD = `package demo

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Disabled
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlin.test.assertEquals

`;

export const KOTEST_HEAD = `package demo

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe
import kotlinx.coroutines.*

`;
