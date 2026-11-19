import { fieldOf, listOf, numberOr, textOf } from '../../../../../../shared/values/readers.mts';
import { lineOf } from '../../scan/kotlin-source.mts';
import { scanTestFile } from '../tests/discovery/test-units.mts';
import { projectFlags } from '../tests/project-flags.mts';
import { fileReports } from '../tests/test-honesty.mts';

function scan(text: string, assertionNames?: string[]): unknown {
  return Reflect.apply(scanTestFile, undefined, [text, assertionNames]);
}

function lineAt(scanned: unknown, offset: number): number {
  return numberOr(Reflect.apply(lineOf, undefined, [scanned, offset]), 0);
}

function reportsOf(scanned: unknown, flags: unknown): Omit<Report, 'line'>[] {
  const found: unknown = Reflect.apply(fileReports, undefined, [scanned, flags]);
  return listOf(found).map((report) => ({
    rule: textOf(fieldOf(report, 'rule')),
    symbol: textOf(fieldOf(report, 'symbol')),
    offset: numberOr(fieldOf(report, 'offset'), 0),
  }));
}

type Report = {
  rule: string;
  symbol: string;
  offset: number;
  line: number;
};

export function flagsFor(texts: string[]): unknown {
  const units = texts.map((text) => ({ scanned: scan(text) }));
  return Reflect.apply(projectFlags, undefined, [units]);
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
