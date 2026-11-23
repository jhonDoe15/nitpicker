import { describe, expect, it } from 'vitest';
import { effectiveRepositoriesXml } from './pom-repositories.mts';

describe('effectiveRepositoriesXml', () => {
  it('extracts repositories and pluginRepositories from a single-module effective POM', () => {
    const pom = `<project xmlns="http://maven.apache.org/POM/4.0.0">
      <repositories>
        <repository>
          <id>repo.jenkins-ci.org</id>
          <name>Jenkins &amp; Friends</name>
          <url>https://repo.jenkins-ci.org/public/</url>
          <releases><enabled>true</enabled></releases>
          <snapshots><enabled>false</enabled></snapshots>
        </repository>
      </repositories>
      <pluginRepositories>
        <pluginRepository>
          <id>jenkins-plugins</id>
          <url>https://repo.jenkins-ci.org/releases/</url>
        </pluginRepository>
      </pluginRepositories>
    </project>`;

    expect(effectiveRepositoriesXml(pom)).toBe(
      [
        '<repositories><repository><id>repo.jenkins-ci.org</id><name>Jenkins &amp; Friends</name>' +
          '<url>https://repo.jenkins-ci.org/public/</url><releases><enabled>true</enabled></releases>' +
          '<snapshots><enabled>false</enabled></snapshots></repository></repositories>',
        '<pluginRepositories><pluginRepository><id>jenkins-plugins</id>' +
          '<url>https://repo.jenkins-ci.org/releases/</url></pluginRepository></pluginRepositories>',
      ].join('\n'),
    );
  });

  it('deduplicates repositories across multi-module reactor effective POMs by id', () => {
    const pom = `<projects>
      <project>
        <repositories>
          <repository><id>custom</id><url>https://repo.example.com/a</url></repository>
          <repository><id>central</id><url>https://repo.maven.apache.org/maven2</url></repository>
        </repositories>
      </project>
      <project>
        <repositories>
          <repository><id>custom</id><url>https://repo.example.com/a</url></repository>
          <repository><id>extra</id><url>https://repo.example.com/b</url></repository>
        </repositories>
      </project>
    </projects>`;

    expect(effectiveRepositoriesXml(pom)).toBe(
      '<repositories>' +
        '<repository><id>custom</id><url>https://repo.example.com/a</url></repository>' +
        '<repository><id>central</id><url>https://repo.maven.apache.org/maven2</url></repository>' +
        '<repository><id>extra</id><url>https://repo.example.com/b</url></repository>' +
        '</repositories>',
    );
  });

  it('returns an empty string when no repositories with a url exist', () => {
    expect(effectiveRepositoriesXml('')).toBe('');
    expect(effectiveRepositoriesXml('<project><artifactId>demo</artifactId></project>')).toBe('');
    expect(
      effectiveRepositoriesXml(
        '<project><repositories><repository><id>broken</id></repository></repositories></project>',
      ),
    ).toBe('');
  });
});
