import { exactText } from '../fixtures/output-expectations.mjs';
import { describe, expect, it } from 'vitest';
import { renderJunitReport } from './junit.mjs';
import { attributeOf, expectWellFormedXml } from './test-support/report-assertions.mjs';
import { finding, report } from './test-support/report-builders.mjs';

describe('renderJunitReport', () => {
  it('produces well-formed XML with a failure per new enforceable finding and tool error', () => {
    const xml = renderJunitReport(
      report({
        newFindings: [
          finding({ message: 'Use <logger> & "quotes"\nsecond line' }),
          finding({ rule: 'size', classification: 'descriptive', identity: 'd' }),
        ],
        toolErrors: [{ tool: 'depcruise', snapshot: 'head', message: "it's \u0001 broken" }],
      }),
    );

    expectWellFormedXml(xml);
    const suite = /<testsuite [^>]*>/u.exec(xml)[0];
    expect(attributeOf(suite, 'tests')).toBe('3');
    expect(attributeOf(suite, 'failures')).toBe('2');
    expect(xml).toEqual(
      expect.stringMatching(exactText`<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="quality.diff" tests="3" failures="2" errors="0" time="${/[0-9]+(?:\.[0-9]+)?/}">
  <testcase classname="quality.diff" name="eslint" time="${/[0-9]+(?:\.[0-9]+)?/}"></testcase>
  <testcase classname="quality.diff.new-findings" name="eslint/no-console src/a.js:12" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="Use &lt;logger&gt; &amp; &quot;quotes&quot; second line" type="eslint/no-console">Use &lt;logger&gt; &amp; &quot;quotes&quot;
second line</failure></testcase>
  <testcase classname="quality.diff" name="depcruise:head" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="it&apos;s � broken">it&apos;s � broken</failure></testcase>
</testsuite>
`),
    );
    expect(xml).not.toContain('eslint/size');
  });
  it('produces well-formed XML for a clean report', () => {
    const xml = renderJunitReport(report());
    expectWellFormedXml(xml);
    expect(attributeOf(/<testsuite [^>]*>/u.exec(xml)[0], 'failures')).toBe('0');
  });
  it('rejects malformed XML in the checker itself', () => {
    expect(() => {
      expectWellFormedXml('<?xml version="1.0" encoding="UTF-8"?>\n<a><b></a>');
    }).toThrow();
    expect(() => {
      expectWellFormedXml('<?xml version="1.0" encoding="UTF-8"?>\n<a x=1></a>');
    }).toThrow();
  });
});
