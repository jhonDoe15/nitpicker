import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
import { kotlinFormatAdvice } from '../kotlin/style/kotlin-format-advice.mjs';
import {
  readJavaFindings,
  rootReports,
  KOTLIN_SOURCE,
  kotlinFindings,
  projectWithKotlinReports,
  removeTemporaryProjects,
} from './test-support/kotlin-report-project.mjs';

afterEach(removeTemporaryProjects);

describe('readJavaFindings with the kotlin preset: detekt, ktlint and ktfmt', () => {
  const bad = 'src/main/kotlin/demo/Bad.kt';
  it('turns the detekt report into schema-valid findings without line numbers in identity', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });
    const detekt = findings.filter((finding) => finding.tool === 'detekt');

    expect(parseAnalyzerReport({ findings }, 'kotlin').findings).toEqual(findings);
    expect(
      detekt.map(({ rule, path: file, identity, classification }) => [
        rule,
        file,
        identity,
        classification,
      ]),
    ).toEqual([
      ...Array.from({ length: 6 }, (_, index) => [
        'detekt.style.MagicNumber',
        bad,
        `fp:nitpicker/subject=This expression contains a magic number. Consider defining it to a well named constant.${index === 0 ? '' : `#${String(index + 1)}`}`,
        'enforceable',
      ]),
      [
        'detekt.style.UnusedPrivateProperty',
        bad,
        'fp:nitpicker/subject=Private property `unused` is unused.',
        'enforceable',
      ],
    ]);
    expect(detekt[0].location).toEqual({ line: 6, column: 26 });
  });
  it('tells a project whose detekt config is left out how to use it', () => {
    const root = projectWithKotlinReports();
    const formatAdvice = kotlinFormatAdvice(
      { ktfmtStyle: 'meta', detektIgnored: 'detekt.yml' },
      {},
    );

    const { findings } = readJavaFindings(root, { preset: 'kotlin', formatAdvice });

    expect(findings.find(({ rule }) => rule === 'detekt.style.MagicNumber').message).toBe(
      'This expression contains a magic number. Consider defining it to a well named constant. ' +
        'Nitpicker runs detekt without your detekt.yml (see the start of the run).',
    );
  });
  it('treats note-level detekt results as descriptive', () => {
    const root = projectWithKotlinReports();
    const at = { physicalLocation: { artifactLocation: { uri: bad }, region: { startLine: 3 } } };
    writeFileSync(
      path.join(rootReports(root), 'detekt.sarif'),
      JSON.stringify({
        runs: [
          {
            tool: { driver: { name: 'detekt' } },
            results: [
              {
                ruleId: 'detekt.style.ForbiddenComment',
                level: 'note',
                message: { text: 'Todo' },
                locations: [at],
              },
            ],
          },
        ],
      }),
    );

    expect(
      kotlinFindings(root, 'detekt').map(({ identity, classification }) => [
        identity,
        classification,
      ]),
    ).toEqual([['fp:nitpicker/subject=Todo', 'descriptive']]);
  });
  it('ends the message of a one-way rule with the allowed form and the exception route, keeping the identity', () => {
    const root = projectWithKotlinReports();
    writeFileSync(
      path.join(rootReports(root), 'detekt.sarif'),
      JSON.stringify({
        runs: [
          {
            tool: { driver: { name: 'detekt' } },
            results: [
              {
                ruleId: 'detekt.potential-bugs.UnsafeCallOnNullableType',
                level: 'warning',
                message: { text: 'Calling !! on a nullable type will throw.' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: bad },
                      region: { startLine: 3 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const [finding] = kotlinFindings(root, 'detekt');

    expect(finding.identity).toBe('fp:nitpicker/subject=Calling !! on a nullable type will throw.');
    expect(finding.message).toMatch(
      new RegExp(
        [
          '^Calling !! on a nullable type will throw\\. Handle null with `value \\?: return`',
          '.*checkNotNull\\(value\\).*"exceptions" entry for rule',
          ' detekt\\.potential-bugs\\.UnsafeCallOnNullableType in nitpicker\\.config\\.json\\.$',
        ].join(''),
        '',
      ),
    );
  });
  it('reports an inline suppression of a one-way rule in a Kotlin source file', () => {
    const root = projectWithKotlinReports();
    writeFileSync(
      path.join(root, bad),
      `${KOTLIN_SOURCE}\n@Suppress("UnsafeCallOnNullableType", "UNCHECKED_CAST")\nfun f(text: String?) = text!!.length\n`,
    );

    expect(
      kotlinFindings(root, 'detekt').filter(({ rule }) => rule === 'inline-suppression'),
    ).toEqual([
      {
        tool: 'detekt',
        rule: 'inline-suppression',
        path: bad,
        identity: 'suppress:UnsafeCallOnNullableType',
        message:
          'Suppressing "UnsafeCallOnNullableType" inline is not allowed. Fix the code the rule flags. To lift a one-way rule for some paths, add an "exceptions" entry for it in nitpicker.config.json; to skip generated code, add it to "exclude" there.',
        classification: 'enforceable',
      },
    ]);
  });
  describe('identity of a finding with a measured value', () => {
    const at = { physicalLocation: { artifactLocation: { uri: bad }, region: { startLine: 3 } } };
    const identitiesOf = (messages) => {
      const root = projectWithKotlinReports();
      writeFileSync(
        path.join(rootReports(root), 'detekt.sarif'),
        JSON.stringify({
          runs: [
            {
              tool: { driver: { name: 'detekt' } },
              results: messages.map((text) => ({
                ruleId: 'detekt.style.Measured',
                level: 'warning',
                message: { text },
                locations: [at],
              })),
            },
          ],
        }),
      );
      return kotlinFindings(root, 'detekt').map(({ identity }) => identity);
    };
    it.each([
      [
        'The function run is too long (64). The maximum length is 60.',
        'The function run is too long (63). The maximum length is 60.',
      ],
      [
        "Class 'Big' with '14' functions detected. Defined threshold inside classes is set to '11'",
        "Class 'Big' with '12' functions detected. Defined threshold inside classes is set to '11'",
      ],
      [
        'Function f has 3 return statements which exceeds the limit of 2.',
        'Function f has 2 return statements which exceeds the limit of 2.',
      ],
    ])('stays baselined when the value changes: %s', (before, after) => {
      expect(identitiesOf([before])).toEqual(identitiesOf([after]));
    });
    it('keeps names that end in digits apart', () => {
      expect(identitiesOf(['Private property `unused1` is unused.'])).not.toEqual(
        identitiesOf(['Private property `unused2` is unused.']),
      );
    });
  });
  it('reports each ktlint violation with its rule and line, and how to lift the rule', () => {
    const ktlint = kotlinFindings(projectWithKotlinReports(), 'ktlint');

    expect(
      ktlint.map(({ rule, path: file, identity, location, classification }) => ({
        rule,
        file,
        identity,
        line: location.line,
        classification,
      })),
    ).toEqual([
      {
        rule: 'ktlint.standard:no-wildcard-imports',
        file: bad,
        identity: 'fp:nitpicker/subject=Wildcard import',
        line: 3,
        classification: 'enforceable',
      },
      {
        rule: 'ktlint.standard:indent',
        file: bad,
        identity: 'fp:nitpicker/subject=Unexpected indentation (#) (should be #)',
        line: 6,
        classification: 'enforceable',
      },
      {
        rule: 'ktlint.standard:indent',
        file: bad,
        identity: 'fp:nitpicker/subject=Unexpected indentation (#) (should be #)#2',
        line: 7,
        classification: 'enforceable',
      },
    ]);
    expect(ktlint[0].message).toBe(
      'Wildcard import. Lift this rule with ktlint_standard_no-wildcard-imports = disabled in .editorconfig, which nitpicker reads only when ktlint lists "project" (see the start of the run). Not your formatter: set kotlin.formatter',
    );
    expect(ktlint[0].message).not.toContain('--format');
  });
  it('reports a file ktfmt wants changed and names the override', () => {
    const root = projectWithKotlinReports({ manifest: { kotlinFormatter: 'ktfmt' } });

    expect(kotlinFindings(root, 'ktfmt')).toEqual([
      {
        tool: 'ktfmt',
        rule: 'format',
        path: bad,
        identity: 'format',
        message:
          'File is not formatted with ktfmt. Format it with the "Format with ktfmt" command printed at the start of the run. Not your formatter: set kotlin.formatter',
        classification: 'enforceable',
      },
    ]);
    expect(kotlinFindings(root, 'ktlint')).toEqual([]);
  });
  it('reports no format finding for a list without files or without a formatter', () => {
    expect(
      kotlinFindings(
        projectWithKotlinReports({ formatList: '', manifest: { kotlinFormatter: 'ktfmt' } }),
        'ktfmt',
      ),
    ).toEqual([]);
    const none = projectWithKotlinReports({ manifest: { kotlinFormatter: 'none' } });
    expect(
      readJavaFindings(none, { preset: 'kotlin' }).findings.filter(({ tool }) =>
        ['ktlint', 'ktfmt'].includes(tool),
      ),
    ).toEqual([]);
  });
});
