import { describe, expect, it } from 'vitest';
import { type Check, type Ruled, scanKotlinSource } from '../typed/typed-scan.mts';
import { pairSplits as untypedPairSplits } from './pair-splits.mjs';

const pairSplits: Check<Ruled> = untypedPairSplits;

function found(body: string) {
  return pairSplits(scanKotlinSource(`fun parse(text: String) {\n${body}\n}\n`)).length;
}

describe('pairSplits', () => {
  it.each([
    ['the second part of a split on a colon', '    val value = text.split(":")[1]'],
    ['the second part of a split on an equals sign', '    val value = text.split("=")[1].trim()'],
    ['a character separator', "    val value = text.split(':')[1]"],
    ['a two-name destructuring', '    val (key, value) = text.split(":")'],
    ['a destructuring with an unused name', '    val (_, value) = text.split("=")'],
    ['a destructuring of a trimmed receiver', '    val (key, value) = text.trim().split("=")'],
  ])('reports %s', (_name, body) => {
    expect(found(body)).toBe(1);
  });

  it.each([
    ['a limit', '    val (key, value) = text.split(":", limit = 2)'],
    ['a positional limit', '    val value = text.split(":", 2)[1]'],
    ['the first part', '    val key = text.split(":")[0]'],
    ['a three-name destructuring', '    val (a, b, c) = text.split(":")'],
    ['other separators', '    val (a, b) = text.split("/")'],
    ['a clock text', '    val (hours, minutes) = text.split(":")'],
    ['a time receiver', '    val value = startTime.split(":")[1]'],
    ['a chained call', '    val (a, b) = text.split(":").map { it.trim() }'],
    ['substringAfter', '    val value = text.substringAfter(":")'],
    ['a string literal', '    val s = "text.split(\\":\\")[1]"'],
    ['a comment', '    // val value = text.split(":")[1]'],
  ])('leaves %s alone', (_name, body) => {
    expect(found(body)).toBe(0);
  });
});
