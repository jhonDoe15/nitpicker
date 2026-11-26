import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { ingestCheckstyle } from '../../ingest/formatting/checkstyle.mts';
import {
  checkstyleXml,
  escaped,
  fileElements,
  mergeReports,
  reportBody,
} from './checkstyle-xml.mts';

const projectWith = useTempProjects('nitpicker-checkstyle-xml-');

const ROW = {
  file: '/p/A.java',
  source: 'com.puppycrawl.tools.checkstyle.checks.naming.MethodNameCheck',
  line: 3,
  column: 7,
  message: "Method name 'X' must match pattern '^[a-z]$'.",
};

describe('escaped', () => {
  it('escapes markup and keeps entity references as written', () => {
    expect(escaped(`a<b>"c"'d' & e &amp; &#38; &#x26;`)).toBe(
      'a&lt;b&gt;&quot;c&quot;&apos;d&apos; &amp; e &amp; &#38; &#x26;',
    );
  });

  it('writes control characters as references', () => {
    expect(escaped('a\u0001b\tc\r\nd\u0085')).toBe('a&#x1;b&#x9;c&#10;d&#x85;');
  });
});

describe('fileElements', () => {
  it('lists every file and leaves out the column when there is none', () => {
    const xml = checkstyleXml(
      '13.5.0',
      fileElements(['/p/A.java', '/p/B.java'], [ROW, { ...ROW, line: 1, column: 0 }]),
    );
    expect(ingestCheckstyle(xml, { root: '/' }).findings).toEqual([
      expect.objectContaining({
        rule: ROW.source,
        path: 'p/A.java',
        location: { line: 3, column: 7 },
      }),
      expect.objectContaining({ rule: ROW.source, path: 'p/A.java', location: { line: 1 } }),
    ]);
    expect(xml).toContain('<file name="/p/B.java">\n</file>');
  });
});

describe('mergeReports', () => {
  it('adds the engine files to the Checkstyle report', () => {
    const root = projectWith({});
    const report = path.join(root, 'checkstyle.xml');
    const engine = path.join(root, 'checkstyle-engine.xml');
    writeFileSync(
      report,
      '<?xml version="1.0"?>\n<checkstyle version="13.5.0">\n<file name="/p/C.java">\n</file>\n</checkstyle>\n',
    );
    writeFileSync(engine, checkstyleXml('13.5.0', fileElements(['/p/A.java'], [ROW])));
    mergeReports(report, engine);
    const merged = readFileSync(report, 'utf8');
    expect(reportBody(merged)).toContain('/p/C.java');
    expect(ingestCheckstyle(merged, { root: '/' }).findings.map((finding) => finding.path)).toEqual(
      ['p/A.java'],
    );
  });

  it('leaves a report Checkstyle could not finish as it is', () => {
    const root = projectWith({});
    const report = path.join(root, 'checkstyle.xml');
    const engine = path.join(root, 'checkstyle-engine.xml');
    writeFileSync(report, '');
    writeFileSync(engine, checkstyleXml('13.5.0', fileElements(['/p/A.java'], [ROW])));
    mergeReports(report, engine);
    expect(readFileSync(report, 'utf8')).toBe('');
  });

  it('refuses a report without a checkstyle element', () => {
    expect(() => reportBody('<pmd/>')).toThrow('no <checkstyle> element');
  });
});
