import { describe, expect, it } from 'vitest';
import { confidentlyCode, shapeOf } from './code-shapes.mts';

describe('shapeOf', () => {
  it.each([
    ['# import os', 'strong'],
    ['# from os import path', 'strong'],
    ['# def f(x):', 'strong'],
    ['# cache = warm(items)', 'strong'],
    ['# retries = 3', 'weak'],
    ['# print(x)', 'weak'],
    ['# if retries:', 'weak'],
    ['# else:', 'weak'],
    ['# return x', 'weak'],
    ['#', 'neutral'],
    ['# )', 'neutral'],
    ['# retries = 3 attempts', 'prose'],
    ['# return value (cached)', 'prose'],
    ['# for example:', 'prose'],
    ['# noqa: E501', 'prose'],
    ['# Disabled until the cache is warm.', 'prose'],
  ])('reads %j as %s', (line, shape) => {
    expect(shapeOf(line)).toBe(shape);
  });
});

describe('confidentlyCode', () => {
  it.each([
    [['# import os'], true],
    [['# if retries:', '#     foo()'], true],
    [['# print(x)'], false],
    [['# return null'], false],
    [['# x = compute(1)', '# then we restart'], false],
  ])('judges %j as %s', (lines, confident) => {
    expect(confidentlyCode(lines)).toBe(confident);
  });
});
