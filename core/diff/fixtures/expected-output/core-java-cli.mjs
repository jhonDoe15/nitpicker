import { expect } from 'vitest';
import { exactText } from '../output-expectations.mjs';
export function expectedOutput150_8() {
  return {
    exitCode: 1,
    output: expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField src/main/java/demo/A.java:4
    Avoid unused field: added
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
  };
}

export function expectedOutput153_31() {
  return expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField src/main/java/demo/A.java:4
    Avoid unused field: added
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`);
}

export function expectedOutput154_46() {
  return [
    {
      tool: 'pmd',
      rule: 'UnusedPrivateField',
      path: 'src/main/java/demo/A.java',
      identity: 'fp:nitpicker/subject=Avoid unused field: added',
      message: 'Avoid unused field: added',
      classification: 'enforceable',
      location: { line: 4 },
    },
  ];
}

export function expectedOutput162_77() {
  return expect.stringMatching(exactText`{
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "nitpicker",
          "informationUri": "https://github.com/jhonDoe15/nitpicker",
          "rules": [
            {
              "id": "pmd/UnusedPrivateField",
              "name": "UnusedPrivateField"
            }
          ]
        }
      },
      "invocations": [
        {
          "executionSuccessful": true,
          "toolExecutionNotifications": []
        }
      ],
      "results": [
        {
          "ruleId": "pmd/UnusedPrivateField",
          "level": "error",
          "message": {
            "text": "Avoid unused field: added"
          },
          "locations": [
            {
              "physicalLocation": {
                "artifactLocation": {
                  "uri": "src/main/java/demo/A.java"
                },
                "region": {
                  "startLine": 4
                }
              }
            }
          ],
          "partialFingerprints": {
            "nitpickerIdentity/v1": "${/[a-f0-9]{64}/}"
          }
        }
      ]
    }
  ]
}
`);
}

export function expectedOutput165_81() {
  return expect.stringMatching(exactText`<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="quality.diff" tests="2" failures="1" errors="0" time="${/[0-9]+(?:\.[0-9]+)?/}">
  <testcase classname="quality.diff" name="java" time="${/[0-9]+(?:\.[0-9]+)?/}"></testcase>
  <testcase classname="quality.diff.new-findings" name="pmd/UnusedPrivateField src/main/java/demo/A.java:4" time="${/[0-9]+(?:\.[0-9]+)?/}"><failure message="Avoid unused field: added" type="pmd/UnusedPrivateField">Avoid unused field: added</failure></testcase>
</testsuite>
`);
}

export function expectedOutput208_10() {
  return {
    exitCode: 1,
    output: expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  pmd/UnusedPrivateField src/main/java/demo/A.java:5
    Avoid unused field: other
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
  };
}

export function expectedOutput211_48() {
  return [
    {
      tool: 'pmd',
      rule: 'UnusedPrivateField',
      path: 'src/main/java/demo/A.java',
      identity: 'fp:nitpicker/subject=Avoid unused field: other',
      message: 'Avoid unused field: other',
      classification: 'enforceable',
      location: { line: 5 },
    },
  ];
}

export function expectedOutput226_10() {
  return {
    exitCode: 1,
    output: expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  java/baseline-expansion src/main/java/demo/A.java
    Legacy allowance increased from 1 to 2 for UnusedPrivateField
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
  };
}

export function expectedOutput229_48() {
  return [
    {
      tool: 'java',
      rule: 'baseline-expansion',
      path: 'src/main/java/demo/A.java',
      identity: 'site:b9e81f40e951757c28a763fd',
      message: 'Legacy allowance increased from 1 to 2 for UnusedPrivateField',
      classification: 'enforceable',
    },
  ];
}

export function expectedOutput260_48() {
  return [
    {
      tool: 'java',
      rule: 'baseline-expansion',
      path: 'src/main/java/demo/A.java',
      identity: 'site:641b8b393b3df93c1ab9d0f7',
      message: 'Legacy allowance increased from 0 to 1 for UnusedPrivateField',
      classification: 'enforceable',
    },
  ];
}

export function expectedOutput283_8() {
  return {
    exitCode: 1,
    output: expect.stringMatching(exactText`Base: comparison-base (argument)

Quality gate summary
✖ 1 new enforceable violation
  duplicates/duplicate-clone src/main/java/demo/First.java:3
    This code repeats src/main/java/demo/Second.java:3 (30 lines). Keep one copy and call it from both places.
Full diagnostics: /tmp/nitpicker-java-out-${/[A-Za-z0-9]{6}/}/reports/report.txt
`),
  };
}

export function expectedOutput289_20() {
  return [
    {
      tool: 'duplicates',
      rule: 'duplicate-clone',
      path: 'src/main/java/demo/First.java',
      identity:
        'pair:src/main/java/demo/First.java|src/main/java/demo/Second.java:fragment:41aa749b80d76291fc31cc1b:occurrence:1',
      message:
        'This code repeats src/main/java/demo/Second.java:3 (30 lines). Keep one copy and call it from both places.',
      classification: 'enforceable',
      location: { line: 3 },
    },
  ];
}

export function expectedOutput311_45() {
  return [
    {
      tool: 'java',
      snapshot: 'head',
      rule: 'gradle-failure',
      path: '.',
      message: expect.stringMatching(
        exactText`Java preset failed in /tmp/nitpicker-diff-${/[A-Za-z0-9]{6}/}/head: Execution failed for task :compileJava`,
      ),
    },
  ];
}

export function expectedOutput328_48() {
  return {
    tool: 'java',
    snapshot: 'base',
    rule: 'gradle-failure',
    path: '.',
    message: expect.stringMatching(
      exactText`spawnSync /tmp/nitpicker-java-none-${/[A-Za-z0-9]{6}/}/no-gradle ENOENT`,
    ),
  };
}

export function expectedOutput345_22() {
  return 'Nitpicker quality snapshot\nStatus: violations\nEnforceable findings: 1\nDescriptive findings: 0\nTool errors: 0\n\nPer-tool counts:\njava: total=1 enforceable=1 descriptive=0\n\nEnforceable findings:\npmd/UnusedPrivateField src/main/java/demo/A.java:3 Avoid unused field: legacy\n';
}

export function expectedOutput378_46() {
  return [
    {
      tool: 'detekt',
      rule: 'detekt.style.MagicNumber',
      path: 'src/main/kotlin/demo/K.kt',
      identity: 'fp:nitpicker/subject=Added magic number',
      message: 'Added magic number',
      classification: 'enforceable',
      location: { line: 4 },
    },
  ];
}
