import { describe, expect, it } from 'vitest';
import { buildText, detectFormatter, ktfmtStyle } from './kotlin-build-text.mjs';
import { mavenFormatterText } from './kotlin-maven-text.mjs';

function pom(plugins, extra = '') {
  return `<project><artifactId>demo</artifactId>${extra}<build><plugins>${plugins}</plugins></build></project>`;
}

function plugin(artifactId, configuration = '') {
  return `<plugin><artifactId>${artifactId}</artifactId><configuration>${configuration}</configuration></plugin>`;
}

function spotlessKotlin(steps, java = '') {
  return plugin('spotless-maven-plugin', `${java}<kotlin>${steps}</kotlin>`);
}

const FACTS = (text) => ({ build: buildText('/nowhere', text), editorconfig: '' });

describe('the formatter a Maven build declares', () => {
  it('is named only by a plugin declaration', () => {
    expect(mavenFormatterText(pom(plugin('ktlint-maven-plugin')))).toBe('ktlint\n');
    expect(mavenFormatterText(pom(plugin('ktfmt-maven-plugin', '<style>GOOGLE</style>')))).toBe(
      'ktfmt\ngoogleStyle',
    );
    expect(
      mavenFormatterText(pom(plugin('exec-maven-plugin', '<executable>ktlint</executable>'))),
    ).toBe('ktlint\n');
    expect(mavenFormatterText(pom(plugin('maven-compiler-plugin')))).toBe('');
  });

  it('reads the ktfmt and ktlint steps of Spotless for Kotlin and ignores the Java steps', () => {
    const java = '<java><googleJavaFormat><style>GOOGLE</style></googleJavaFormat></java>';

    expect(mavenFormatterText(pom(spotlessKotlin('<ktfmt/>', java)))).toBe('ktfmt\n');
    expect(
      mavenFormatterText(pom(spotlessKotlin('<ktfmt><style>DROPBOX</style></ktfmt>', java))),
    ).toBe('ktfmt\nkotlinlangStyle');
    expect(mavenFormatterText(pom(spotlessKotlin('<ktlint/>')))).toBe('ktlint\n');
    expect(
      mavenFormatterText(pom(plugin('spotless-maven-plugin', '<java><googleJavaFormat/></java>'))),
    ).toBe('');
  });

  it('does not mistake a name, a dependency or a comment for a formatter', () => {
    const named = pom(
      '<!-- ktlint is configured elsewhere -->',
      '<name>ktlint-rules</name><dependencies><dependency><artifactId>ktfmt</artifactId></dependency></dependencies>',
    );

    expect(mavenFormatterText(named)).toBe('');
    expect(mavenFormatterText(undefined)).toBe('');
    expect(mavenFormatterText('<project/>')).toBe('');
  });

  it('reads every project of an effective POM that lists the whole reactor', () => {
    const reactor = `<projects>${pom('')}${pom(plugin('ktfmt-maven-plugin'))}</projects>`;

    expect(mavenFormatterText(reactor)).toBe('ktfmt\n');
  });
});

describe('the Kotlin facts of a Maven build', () => {
  it('picks ktlint over ktfmt and follows the ktfmt style of the ktfmt declaration only', () => {
    const java = '<java><googleJavaFormat><style>GOOGLE</style></googleJavaFormat></java>';
    const ktfmt = pom(spotlessKotlin('<ktfmt><style>KOTLINLANG</style></ktfmt>', java));

    expect(detectFormatter(FACTS(ktfmt))).toBe('ktfmt');
    expect(ktfmtStyle({ build: FACTS(ktfmt).build, conventions: {} })).toBe('kotlinlang');
    expect(
      detectFormatter(FACTS(pom(plugin('ktlint-maven-plugin') + plugin('ktfmt-maven-plugin')))),
    ).toBe('ktlint');
  });

  it('detects no formatter from a project that only carries the word', () => {
    expect(detectFormatter(FACTS(pom('', '<name>ktlint-rules</name>')))).toBe('none');
  });
});
