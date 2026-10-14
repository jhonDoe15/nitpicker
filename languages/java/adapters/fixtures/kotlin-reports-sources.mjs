export const JACOCO = `<?xml version="1.0" encoding="UTF-8"?>
<report name="demo"><package name="demo">
  <class name="demo/Bad" sourcefilename="Bad.kt">
    <method name="compute" desc="(II)I" line="8"><counter type="LINE" missed="3" covered="0"/></method>
  </class>
  <class name="demo/Legacy" sourcefilename="Legacy.java">
    <method name="pick" desc="(Z)I" line="4"><counter type="LINE" missed="0" covered="3"/></method>
  </class>
  <sourcefile name="Mixed.kt">
    <line nr="3" mi="1" ci="0" mb="2" cb="0"/>
    <counter type="LINE" missed="1" covered="0"/>
  </sourcefile>
  <sourcefile name="Bad.kt">
    <line nr="8" mi="1" ci="0" mb="1" cb="1"/>
    <line nr="9" mi="1" ci="0" mb="2" cb="0"/>
    <counter type="LINE" missed="3" covered="0"/>
  </sourcefile>
  <sourcefile name="Legacy.java">
    <line nr="4" mi="0" ci="3" mb="1" cb="1"/>
    <counter type="LINE" missed="0" covered="3"/>
  </sourcefile>
</package></report>`;

export const KOTLIN_SOURCE = `package demo

class Bad {
    private val unused = 42

    suspend fun compute(a: Int, b: Int): Int {
        val x = a * 1000 + b * 2000
        if (x > 5000) return x
        return withContext(Dispatchers.Default) { 7777 }
    }
}
`;

export const MIXED_SOURCE = 'package demo\n\nfun pick(flag: Boolean) = if (flag) 1 else 2\n';

export const JAVA_SOURCE =
  'package demo;\n\nclass Legacy {\n  int pick(boolean flag) { return flag ? 1 : 2; }\n}\n';

export const mutation = (
  status,
  className,
  sourceFile,
  line,
) => `<mutation detected='false' status='${status}'>
  <sourceFile>${sourceFile}</sourceFile><mutatedClass>${className}</mutatedClass>
  <mutatedMethod>compute</mutatedMethod><methodDescription>(II)I</methodDescription>
  <lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator>
  <description>Replaced integer addition with subtraction</description></mutation>`;

export const PIT = `<mutations>${[
  mutation('SURVIVED', 'demo.Bad', 'Bad.kt', 7),
  mutation('NO_COVERAGE', 'demo.BadKt$lambda$1', 'Bad.kt', 8),
  mutation('SURVIVED', 'demo.Legacy', 'Legacy.java', 4),
  mutation('KILLED', 'demo.Bad', 'Bad.kt', 9),
  mutation('SURVIVED', 'kotlin.properties.Delegates', 'Delegates.kt', 3),
].join('\n')}</mutations>`;

export const EMPTY_SARIF = JSON.stringify({ version: '2.1.0', runs: [] });

export const ktlintResult = (ruleId, text, line) => ({
  ruleId,
  level: 'error',
  message: { text },
  locations: [
    {
      physicalLocation: {
        artifactLocation: { uri: 'src/main/kotlin/demo/Bad.kt' },
        region: { startLine: line, startColumn: 1 },
      },
    },
  ],
});

export const KTLINT_SARIF = JSON.stringify({
  runs: [
    {
      tool: { driver: { name: 'ktlint' } },
      results: [
        ktlintResult('standard:no-wildcard-imports', 'Wildcard import', 3),
        ktlintResult('standard:indent', 'Unexpected indentation (6) (should be 4)', 6),
        ktlintResult('standard:indent', 'Unexpected indentation (9) (should be 4)', 7),
      ],
    },
  ],
});
