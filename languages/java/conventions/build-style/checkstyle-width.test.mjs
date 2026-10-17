import { describe, expect, it } from 'vitest';
import { checkstyleLineLength } from './checkstyle-width.mjs';

const lineLength = (module) =>
  `<?xml version="1.0"?><!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN" "https://checkstyle.org/dtds/configuration_1_3.dtd"><module name="Checker"><module name="TreeWalker">${module}</module></module>`;
const withMax = (max, name = 'LineLength') =>
  lineLength(`<module name="${name}"><property name="max" value="${max}"/></module>`);

describe('checkstyleLineLength', () => {
  it('reads the max of the LineLength module, with or without the package and Check suffix', () => {
    expect(checkstyleLineLength(withMax('120'))).toEqual({ max: '120' });
    expect(
      checkstyleLineLength(
        withMax('120', 'com.puppycrawl.tools.checkstyle.checks.sizes.LineLengthCheck'),
      ),
    ).toEqual({ max: '120' });
  });

  it.each(['110', '150', '160'])('reads %s, which is none of the common widths', (max) => {
    expect(checkstyleLineLength(withMax(max))).toEqual({ max });
  });

  it('reads a LineLength module that sits directly under Checker', () => {
    expect(
      checkstyleLineLength(
        '<module name="Checker"><module name="LineLength"><property name="max" value="130"/></module></module>',
      ),
    ).toEqual({ max: '130' });
  });

  it("means Checkstyle's default of 80 for a LineLength module without a max", () => {
    expect(checkstyleLineLength(lineLength('<module name="LineLength"/>'))).toEqual({ max: '80' });
    expect(
      checkstyleLineLength(
        lineLength(
          '<module name="LineLength"><property name="ignorePattern" value="^import"/></module>',
        ),
      ),
    ).toEqual({ max: '80' });
  });

  it('has no answer without a LineLength module, with a commented one or with a property reference', () => {
    expect(checkstyleLineLength(lineLength('<module name="NeedBraces"/>'))).toEqual({});
    expect(
      checkstyleLineLength(
        '<module name="Checker"><!-- <module name="LineLength"><property name="max" value="120"/></module> --></module>',
      ),
    ).toEqual({});
    expect(checkstyleLineLength(withMax('${max}'))).toEqual({});
  });

  it('does not read a LineLength module whose severity is ignore, but one that follows it', () => {
    const ignored =
      '<module name="LineLength"><property name="severity" value="ignore"/><property name="max" value="150"/></module>';

    expect(checkstyleLineLength(lineLength(ignored))).toEqual({});
    expect(
      checkstyleLineLength(
        lineLength(
          `${ignored}<module name="LineLength"><property name="max" value="130"/></module>`,
        ),
      ),
    ).toEqual({ max: '130' });
  });

  it('hands over a width outside the supported range, for the caller to judge', () => {
    expect(checkstyleLineLength(withMax('1000'))).toEqual({ max: '1000' });
    expect(checkstyleLineLength(withMax('5'))).toEqual({ max: '5' });
  });

  it('says why a config that does not parse was not read', () => {
    expect(checkstyleLineLength('<module name="Checker">')).toEqual({
      failure: 'XML element <module> is not closed',
    });
  });
});
