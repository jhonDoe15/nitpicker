import { describe, expect, it } from 'vitest';
import {
  declaredKtfmtStyle,
  detectFormatter,
  kotlinFilesOf,
  ktfmtStyle,
  mavenBuildFacts,
} from './kotlin-build-text.mjs';
import { mavenFormatters } from './kotlin-maven-text.mjs';

const SPOTLESS = ['com.diffplug.spotless', 'spotless-maven-plugin'];
const GANTSIGN = ['com.github.gantsign.maven', 'ktlint-maven-plugin'];
const EXEC = ['org.codehaus.mojo', 'exec-maven-plugin'];

function pom(plugins, extra = '') {
  return `<project><artifactId>demo</artifactId>${extra}<build><plugins>${plugins}</plugins></build></project>`;
}

function plugin([groupId, artifactId], configuration = '') {
  return `<plugin><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId><configuration>${configuration}</configuration></plugin>`;
}

function spotlessKotlin(steps, java = '') {
  return plugin(SPOTLESS, `${java}<kotlin>${steps}</kotlin>`);
}

const facts = (text) => kotlinFilesOf('/nowhere', text);

describe('the formatter a Maven build declares', () => {
  it('is named only by the coordinates of a known plugin', () => {
    expect(mavenFormatters(pom(plugin(GANTSIGN)))).toEqual([
      { formatter: 'ktlint', via: 'plugin' },
    ]);
    expect(mavenFormatters(pom(plugin(EXEC, '<executable>ktfmt</executable>')))).toEqual([]);
    expect(mavenFormatters(pom(plugin(['org.example', 'my-ktlint-helper'])))).toEqual([]);
    expect(
      mavenFormatters(pom(plugin(['org.apache.maven.plugins', 'maven-compiler-plugin']))),
    ).toEqual([]);
  });

  it('reads the ktfmt and ktlint steps of Spotless for Kotlin and ignores the Java steps', () => {
    const java = '<java><googleJavaFormat><style>GOOGLE</style></googleJavaFormat></java>';

    expect(mavenFormatters(pom(spotlessKotlin('<ktfmt/>', java)))).toEqual([
      { formatter: 'ktfmt', style: undefined, via: 'spotless' },
    ]);
    expect(
      mavenFormatters(pom(spotlessKotlin('<ktfmt><style>DROPBOX</style></ktfmt>', java))),
    ).toEqual([{ formatter: 'ktfmt', style: 'kotlinlang', via: 'spotless' }]);
    expect(mavenFormatters(pom(spotlessKotlin('<ktlint/>')))).toEqual([
      { formatter: 'ktlint', style: undefined, via: 'spotless' },
    ]);
    expect(mavenFormatters(pom(plugin(SPOTLESS, '<java><googleJavaFormat/></java>')))).toEqual([]);
  });

  it('does not mistake a name, a dependency or a comment for a formatter', () => {
    const named = pom(
      '<!-- ktlint is configured elsewhere -->',
      '<name>ktlint-rules</name><dependencies><dependency><artifactId>ktfmt</artifactId></dependency></dependencies>',
    );

    expect(mavenFormatters(named)).toEqual([]);
    expect(mavenFormatters(undefined)).toEqual([]);
    expect(mavenFormatters('<project/>')).toEqual([]);
  });

  it('reads no declaration from a pom that is not well formed', () => {
    const broken =
      '<project><build><plugins><plugin><artifactId>x</plugin></plugins></build></project>';

    expect(mavenFormatters(broken)).toEqual([]);
  });

  it('reads every project of an effective POM that lists the whole reactor', () => {
    const reactor = `<projects>${pom('')}${pom(spotlessKotlin('<ktfmt/>'))}</projects>`;

    expect(mavenFormatters(reactor)).toEqual([
      { formatter: 'ktfmt', style: undefined, via: 'spotless' },
    ]);
  });
});

describe('the Kotlin facts of a Maven build', () => {
  it('picks ktlint over ktfmt and follows the ktfmt style of the ktfmt declaration only', () => {
    const java = '<java><googleJavaFormat><style>GOOGLE</style></googleJavaFormat></java>';
    const ktfmt = pom(spotlessKotlin('<ktfmt><style>KOTLINLANG</style></ktfmt>', java));

    expect(detectFormatter(facts(ktfmt))).toBe('ktfmt');
    expect(declaredKtfmtStyle(facts(ktfmt))).toBe('kotlinlang');
    expect(ktfmtStyle({ declared: 'kotlinlang', conventions: {} })).toBe('kotlinlang');
    expect(detectFormatter(facts(pom(plugin(GANTSIGN) + spotlessKotlin('<ktfmt/>'))))).toBe(
      'ktlint',
    );
  });

  it('detects no formatter from a project that only carries the word', () => {
    expect(detectFormatter(facts(pom('', '<name>ktlint-rules</name>')))).toBe('none');
  });

  it('is handed on as one record that names the build and the declared style', () => {
    const ktfmt = pom(spotlessKotlin('<ktfmt><style>GOOGLE</style></ktfmt>'));

    expect(mavenBuildFacts(facts(ktfmt))).toEqual({
      formatter: 'ktfmt',
      build: 'maven',
      ktfmtStyle: 'google',
    });
    expect(mavenBuildFacts(facts(pom('')), 'ktlint')).toEqual({
      formatter: 'ktlint',
      build: 'maven',
    });
  });
});
