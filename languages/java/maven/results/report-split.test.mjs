import { describe, expect, it } from 'vitest';
import { archunitMatcher } from '../maven-tests.mjs';
import { splitReport } from './report-split.mjs';

const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const ARCH = '<testcase name="layers" classname="shop.LayerArchTest" time="0.01"/>';
const ORDER =
  '<testcase name="totals" classname="shop.OrderTest" time="0.2"><failure message="a &gt; b">trace</failure></testcase>';
const TESTNG_SUITE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="TestSuite" tests="2"><properties><property name="a" value="b"/></properties>${ORDER}${ARCH}</testsuite>`;
const split = (text, name = 'TestSuite') => splitReport(text, archunitMatcher(), name);

describe('splitReport', () => {
  it('separates the ArchUnit classes of one TestNG suite report from the other tests', () => {
    expect(split(TESTNG_SUITE)).toEqual({
      archunit: `${HEADER}<testsuite name="TestSuite">${ARCH}</testsuite>\n`,
      other: `${HEADER}<testsuite name="TestSuite">${ORDER}</testsuite>\n`,
    });
  });

  it('keeps a report that holds only one kind as it is', () => {
    const archOnly = `<testsuite name="shop.LayerArchTest">${ARCH}</testsuite>`;
    const orderOnly = `<testsuite name="shop.OrderTest">${ORDER}</testsuite>`;

    expect(split(archOnly)).toEqual({ archunit: archOnly });
    expect(split(orderOnly)).toEqual({ other: orderOnly });
  });

  it('classifies a report without test cases by its suite name, else by the file name', () => {
    expect(split('<testsuite name="shop.LayerArchTest"/>')).toEqual({
      archunit: '<testsuite name="shop.LayerArchTest"/>',
    });
    expect(split('<a/>', 'shop.LayerArchTest')).toEqual({ archunit: '<a/>' });
    expect(split('<a/>', 'shop.OrderTest')).toEqual({ other: '<a/>' });
  });
});
