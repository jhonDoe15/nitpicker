import { lineOf } from '../../scan/kotlin-source.mjs';
import { scanTestFile } from '../tests/discovery/test-units.mjs';
import { projectFlags } from '../tests/project-flags.mjs';
import { fileReports } from '../tests/test-honesty.mjs';

export function flagsFor(texts) {
  return projectFlags(texts.map((text) => ({ scanned: scanTestFile(text) })));
}

function reportsFor(text, flags = flagsFor([text]), assertionNames = []) {
  const scanned = scanTestFile(text, assertionNames);
  return fileReports(scanned, flags).map((report) => ({
    ...report,
    line: lineOf(scanned, report.offset),
  }));
}

export function summaryOf(text, flags) {
  return reportsFor(text, flags).map(({ rule, symbol }) => `${rule} ${symbol}`);
}

export function rulesOf(text, rule, flags, assertionNames) {
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
