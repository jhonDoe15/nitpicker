import { describe, expect, it } from 'vitest';
import { checkstyleLineLength } from './checkstyle-width.mjs';

const lineLength = (module) =>
  `<?xml version="1.0"?><!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN" "https://checkstyle.org/dtds/configuration_1_3.dtd"><module name="Checker"><module name="TreeWalker">${module}</module></module>`;
const withMax = (max, name = 'LineLength') =>
  lineLength(`<module name="${name}"><property name="max" value="${max}"/></module>`);

describe('checkstyleLineLength', () => {
  it('reads the max of the LineLength module, with or without the package and Check suffix', () => {
    expect(checkstyleLineLength(withMax('120'))).toBe('120');
    expect(
      checkstyleLineLength(
        withMax('120', 'com.puppycrawl.tools.checkstyle.checks.sizes.LineLengthCheck'),
      ),
    ).toBe('120');
  });

  it.each(['110', '150', '160'])('reads %s, which is none of the common widths', (max) => {
    expect(checkstyleLineLength(withMax(max))).toBe(max);
  });

  it('reads a LineLength module that sits directly under Checker', () => {
    expect(
      checkstyleLineLength(
        '<module name="Checker"><module name="LineLength"><property name="max" value="130"/></module></module>',
      ),
    ).toBe('130');
  });

  it("means Checkstyle's default of 80 for a LineLength module without a max", () => {
    expect(checkstyleLineLength(lineLength('<module name="LineLength"/>'))).toBe('80');
    expect(
      checkstyleLineLength(
        lineLength(
          '<module name="LineLength"><property name="ignorePattern" value="^import"/></module>',
        ),
      ),
    ).toBe('80');
  });

  it('has no answer without a LineLength module, with a commented one or with a property reference', () => {
    expect(checkstyleLineLength(lineLength('<module name="NeedBraces"/>'))).toBeUndefined();
    expect(
      checkstyleLineLength(
        '<module name="Checker"><!-- <module name="LineLength"><property name="max" value="120"/></module> --></module>',
      ),
    ).toBeUndefined();
    expect(checkstyleLineLength(withMax('${max}'))).toBeUndefined();
    expect(checkstyleLineLength('<module name="Checker">')).toBeUndefined();
  });
});
