import { describe, expect, it } from 'vitest';
import { ERRORPRONE, errorproneDeclarations, errorproneLayers } from './errorprone-declared.mjs';
import { readDeclaredBuild } from './declared-build.mjs';

function sourceOf(files) {
  return {
    paths: () => Object.keys(files),
    readMany: (wanted) =>
      new Map(wanted.filter((file) => file in files).map((file) => [file, files[file]])),
  };
}

const flagsOf = (files) =>
  errorproneDeclarations(readDeclaredBuild(sourceOf(files))).map(({ setting }) => setting);

const GROOVY = `import net.ltgt.gradle.errorprone.CheckSeverity
plugins { id 'java'; id 'net.ltgt.errorprone' version '4.1.0' }
dependencies { errorprone 'com.google.errorprone:error_prone_core:2.50.0' }
tasks.withType(JavaCompile).configureEach {
    options.errorprone {
        disableWarningsInGeneratedCode = true
        disable('UnusedVariable', 'ReferenceEquality')
        enable 'ReturnMissingNullable'
        check('MissingDefault', CheckSeverity.ERROR)
        option('NullAway:AnnotatedPackages', 'com.example')
        option('Var:Strict')
        excludedPaths = '.*/build/generated/.*'
        errorproneArgs.add('-XepOpt:NullAway:ExcludedFieldAnnotations=com.example.Wired')
    }
}
`;
const KOTLIN = `import net.ltgt.gradle.errorprone.errorprone
import net.ltgt.gradle.nullaway.nullaway
tasks.withType<JavaCompile>().configureEach {
    options.errorprone.ignoreSuppressionAnnotations.set(true)
    options.errorprone.nullaway {
        annotatedPackages.add("com.example")
        checkOptionalEmptiness.set(true)
    }
}
`;
const POM = `<project><build><plugins><plugin>
  <artifactId>maven-compiler-plugin</artifactId>
  <configuration><compilerArgs>
    <arg>-XDcompilePolicy=simple</arg>
    <arg>-Xplugin:ErrorProne -XepAllDisabledChecksAsWarnings -Xep:\${ep.check}:WARN -XepOpt:Var:Strict</arg>
  </compilerArgs></configuration>
</plugin></plugins></build>
<properties><ep.check>FieldMissingNullable</ep.check></properties>
</project>`;

describe('the Error Prone flags a build declares', () => {
  it('reads the options.errorprone block of the Gradle plugin as flags', () => {
    expect(flagsOf({ 'build.gradle': GROOVY })).toEqual([
      '-XepDisableWarningsInGeneratedCode',
      '-Xep:UnusedVariable:OFF',
      '-Xep:ReferenceEquality:OFF',
      '-Xep:ReturnMissingNullable:WARN',
      '-Xep:MissingDefault:ERROR',
      '-XepOpt:NullAway:AnnotatedPackages=com.example',
      '-XepOpt:Var:Strict=true',
      '-XepExcludedPaths:.*/build/generated/.*',
      '-XepOpt:NullAway:ExcludedFieldAnnotations=com.example.Wired',
    ]);
  });

  it('reads the Kotlin DSL and the nullaway extension', () => {
    expect(flagsOf({ 'app/build.gradle.kts': KOTLIN })).toEqual([
      '-XepIgnoreSuppressionAnnotations',
      '-XepOpt:NullAway:AnnotatedPackages=com.example',
      '-XepOpt:NullAway:CheckOptionalEmptiness=true',
    ]);
  });

  it('reads the flags after -Xplugin:ErrorProne in the compilerArgs, with properties resolved', () => {
    expect(flagsOf({ 'pom.xml': POM })).toEqual([
      '-XepAllDisabledChecksAsWarnings',
      '-Xep:FieldMissingNullable:WARN',
      '-XepOpt:Var:Strict',
    ]);
  });

  it('reads plain compilerArgs of a Gradle build without the plugin', () => {
    const build = `tasks.withType(JavaCompile) {
    options.compilerArgs += ['-XDcompilePolicy=simple', '-Xplugin:ErrorProne -Xep:BadImport:OFF']
}
`;

    expect(flagsOf({ 'build.gradle': build })).toEqual(['-Xep:BadImport:OFF']);
  });
});

describe('the Error Prone flags each precedence runs with', () => {
  const declared = (flags) => flags.map((setting) => ({ setting, file: 'build.gradle' }));
  const layered = (flags, projectWins) => errorproneLayers(declared(flags), { projectWins });

  it('never turns a check off, and turns one nitpicker disables on only when the project wins', () => {
    const flags = ['-Xep:ReferenceEquality:OFF', '-Xep:UnusedVariable:OFF', '-Xep:UnusedVariable'];

    expect(layered(flags, true)).toEqual({
      flags: ['-Xep:UnusedVariable:WARN'],
      notApplied: declared(['-Xep:ReferenceEquality:OFF']),
    });
    expect(layered(flags, false)).toEqual({
      flags: [],
      notApplied: declared(['-Xep:ReferenceEquality:OFF', '-Xep:UnusedVariable']),
    });
  });

  it('adds checks nitpicker leaves at their default under every ordering', () => {
    expect(layered(['-Xep:ReturnMissingNullable:ERROR'], false).flags).toEqual([
      '-Xep:ReturnMissingNullable:WARN',
    ]);
  });

  it('drops NullAway, unknown checks and the flags that would turn checks off or narrow NullAway', () => {
    const dropped = [
      '-Xep:NullAway:ERROR',
      '-Xep:NoSuchCheck:WARN',
      '-XepOpt:NullAway:AnnotatedPackages=com.example',
      '-XepOpt:NullAway:UnannotatedSubPackages=com.example.gen',
      '-XepOpt:CheckReturnValue:Packages=com.example',
      '-XepAllDisabledChecksAsWarnings',
      '-XepDisableAllChecks',
      '-XepPatchChecks:MissingOverride',
    ];

    expect(layered(dropped, true)).toEqual({ flags: [], notApplied: declared(dropped) });
  });

  it('keeps nitpicker turning off what it already turns off, and skips what it already runs', () => {
    expect(layered(['-Xep:UnusedVariable:OFF', '-Xep:MissingBraces:WARN'], true)).toEqual({
      flags: [],
      notApplied: [],
    });
  });

  it('adds the project exclusions and NullAway annotation lists to nitpicker values', () => {
    const flags = [
      '-XepExcludedPaths:.*/gen/.*',
      '-XepExcludedPaths:.*/proto/.*',
      '-XepDisableWarningsInGeneratedCode',
      '-XepOpt:NullAway:ExcludedFieldAnnotations=com.example.Wired',
      '-XepOpt:Var:Strict=true',
    ];
    const result = layered(flags, false).flags;

    expect(result.slice(0, 2)).toEqual([
      '-XepDisableWarningsInGeneratedCode',
      '-XepOpt:Var:Strict=true',
    ]);
    expect(result[2]).toMatch(
      /^-XepOpt:NullAway:ExcludedFieldAnnotations=.*org\.mockito\.Mock,.*com\.example\.Wired$/u,
    );
    expect(result[3]).toBe('-XepExcludedPaths:(?:.*/gen/.*)|(?:.*/proto/.*)');
  });

  it('honours the suppression switches only when the project wins', () => {
    expect(layered(['-XepIgnoreSuppressionAnnotations'], true).flags).toEqual([
      '-XepIgnoreSuppressionAnnotations',
    ]);
    expect(layered(['-XepIgnoreSuppressionAnnotations'], false).notApplied).toHaveLength(1);
  });
});

describe('the notice about Error Prone flags', () => {
  it('names the flags an opted-in run leaves out', () => {
    const declarations = [
      { setting: '-Xep:ReferenceEquality:OFF', file: 'build.gradle' },
      { setting: '-Xep:Var:WARN', file: 'build.gradle' },
    ];

    expect(ERRORPRONE.notice(declarations, { nitpickerFirst: false })).toEqual([
      "Error Prone runs nitpicker's checks with your flags laid over them; not applied from your build, because they turn a check off, narrow NullAway or name no check nitpicker's Error Prone has: -Xep:ReferenceEquality:OFF (build.gradle)",
    ]);
    expect(ERRORPRONE.notice(declarations.slice(1), { nitpickerFirst: false })).toEqual([]);
  });

  it('fails when the opted-in build declares no flags', () => {
    expect(() =>
      ERRORPRONE.choice({ scripts: [], poms: [] }, { layers: { nitpickerFirst: false } }),
    ).toThrow(
      /^"tools\.errorprone\.precedence" lists "project" but Error Prone settings in the build .* is missing: .*$/u,
    );
  });
});
