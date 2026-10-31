import { describe, expect, it } from 'vitest';
import { toTree } from '../../../tree.mjs';
import { detectLanguageConfigEdits } from '../config-files.mjs';

const detect = (file, before, after) =>
  detectLanguageConfigEdits(toTree({ [file]: before }), toTree({ [file]: after }));

const POM = `<project>
  <properties>
    <maven.compiler.release>21</maven.compiler.release>
  </properties>
  <dependencies>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId></dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.5.2</version>
      </plugin>
    </plugins>
  </build>
</project>
`;

describe('Maven pom.xml', () => {
  const change = (replacement, from) => detect('pom.xml', POM, POM.replace(from, replacement));
  const dependency =
    '<dependency><groupId>com.google.guava</groupId><artifactId>guava</artifactId></dependency>';

  it('reports nothing for a dependency or a plain property', () => {
    expect(change(`${dependency}\n    </dependencies>`, '</dependencies>')).toEqual([]);
    expect(
      change(
        '<maven.compiler.release>21</maven.compiler.release>\n    <guava.version>33.0.0</guava.version>',
        '<maven.compiler.release>21</maven.compiler.release>',
      ),
    ).toEqual([]);
  });

  it.each([
    [
      'skips tests with a property',
      '</properties>',
      '  <skipTests>true</skipTests>\n  </properties>',
    ],
    [
      'skips tests with maven.test.skip',
      '</properties>',
      '  <maven.test.skip>true</maven.test.skip>\n  </properties>',
    ],
    [
      'configures surefire',
      '<version>3.5.2</version>',
      '<version>3.5.2</version>\n        <configuration><excludes><exclude>**/Slow*</exclude></excludes></configuration>',
    ],
    [
      'ignores test failures',
      '<version>3.5.2</version>',
      '<version>3.5.2</version>\n        <configuration><testFailureIgnore>true</testFailureIgnore></configuration>',
    ],
    [
      'removes surefire',
      '<plugin>\n        <artifactId>maven-surefire-plugin</artifactId>\n        <version>3.5.2</version>\n      </plugin>',
      '',
    ],
    [
      'adds jacoco with a skip',
      '</plugins>',
      '<plugin><artifactId>jacoco-maven-plugin</artifactId><configuration><skip>true</skip></configuration></plugin>\n    </plugins>',
    ],
    [
      'adds checkstyle with failOnViolation off',
      '</plugins>',
      '<plugin>\n<artifactId>maven-checkstyle-plugin</artifactId>\n<configuration><failOnViolation>false</failOnViolation></configuration>\n</plugin>\n    </plugins>',
    ],
  ])('reports a pom that %s', (_name, from, replacement) => {
    expect(change(replacement, from)).toMatchObject([
      { kind: 'build-config-edit', path: 'pom.xml' },
    ]);
  });

  it('ignores a commented-out plugin', () => {
    expect(
      change(
        '<!-- <plugin><artifactId>jacoco-maven-plugin</artifactId></plugin> -->\n    </plugins>',
        '</plugins>',
      ),
    ).toEqual([]);
  });

  it('applies to a pom in a module folder', () => {
    const [shortcut] = detect(
      'core/pom.xml',
      POM,
      POM.replace('</properties>', '<skipTests>true</skipTests></properties>'),
    );
    expect(shortcut.path).toBe('core/pom.xml');
  });
});
