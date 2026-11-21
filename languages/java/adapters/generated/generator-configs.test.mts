import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { configuredGeneratedDirectories, isConfiguredGenerated } from './generator-configs.mts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files: Readonly<Record<string, string>>): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-generator-configs-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const MALL_CONFIG = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<generatorConfiguration>',
  '  <context id="MySqlContext">',
  '    <javaModelGenerator targetPackage="com.macro.mall.model" targetProject="mall-mbg\\src\\main\\java"/>',
  '    <javaClientGenerator targetProject="mall-mbg\\src\\main\\java" type="XMLMAPPER" targetPackage="com.macro.mall.mapper"/>',
  '  </context>',
  '</generatorConfiguration>',
].join('\n');

describe('configuredGeneratedDirectories', () => {
  it('parses javaModelGenerator and javaClientGenerator with Windows separators and any attribute order', () => {
    const root = project({
      'mall-mbg/pom.xml': '<project/>',
      'mall-mbg/src/main/resources/generatorConfig.xml': MALL_CONFIG,
      'mall-mbg/src/main/java/com/macro/mall/model/PmsBrandExample.java':
        'package com.macro.mall.model;\nclass PmsBrandExample {}\n',
      'mall-mbg/src/main/java/com/macro/mall/mapper/PmsBrandMapper.java':
        'package com.macro.mall.mapper;\ninterface PmsBrandMapper {}\n',
    });

    expect(configuredGeneratedDirectories(root)).toEqual([
      'mall-mbg/src/main/java/com/macro/mall/mapper/',
      'mall-mbg/src/main/java/com/macro/mall/model/',
    ]);
    expect(
      isConfiguredGenerated(
        root,
        'mall-mbg/src/main/java/com/macro/mall/model/PmsBrandExample.java',
      ),
    ).toBe(true);
    expect(
      isConfiguredGenerated(root, 'mall-mbg/src/main/java/com/macro/mall/model2/HandWritten.java'),
    ).toBe(false);
    expect(
      isConfiguredGenerated(
        root,
        'mall-mbg/src/main/java/com/macro/mall/service/BrandService.java',
      ),
    ).toBe(false);
  });

  it('finds custom configurationFile entries referenced by mybatis-generator-maven-plugin in pom.xml', () => {
    const pom = [
      '<project>',
      '  <build>',
      '    <plugins>',
      '      <plugin>',
      '        <artifactId>maven-checkstyle-plugin</artifactId>',
      '        <configuration>',
      '          <configurationFile>src/main/resources/other.xml</configurationFile>',
      '        </configuration>',
      '      </plugin>',
      '      <plugin>',
      '        <groupId>org.mybatis.generator</groupId>',
      '        <artifactId>mybatis-generator-maven-plugin</artifactId>',
      '        <configuration>',
      '          <configurationFile>src/main/resources/custom-mbg.xml</configurationFile>',
      '        </configuration>',
      '      </plugin>',
      '    </plugins>',
      '  </build>',
      '</project>',
    ].join('\n');
    const customConfig = [
      '<generatorConfiguration>',
      '  <context id="custom">',
      '    <javaModelGenerator targetPackage="com.example.generated" targetProject="src/main/java"/>',
      '  </context>',
      '</generatorConfiguration>',
    ].join('\n');
    const unrelatedConfig = [
      '<generatorConfiguration>',
      '  <context id="ignored">',
      '    <javaModelGenerator targetPackage="com.example.hand" targetProject="src/main/java"/>',
      '  </context>',
      '</generatorConfiguration>',
    ].join('\n');
    const root = project({
      'module-a/pom.xml': pom,
      'module-a/src/main/resources/custom-mbg.xml': customConfig,
      'module-a/src/main/resources/other.xml': unrelatedConfig,
      'module-a/src/main/java/com/example/generated/ItemExample.java':
        'package com.example.generated;\nclass ItemExample {}\n',
    });

    expect(configuredGeneratedDirectories(root)).toEqual([
      'module-a/src/main/java/com/example/generated/',
    ]);
  });

  it('ignores XML comments, skipped build directories, and paths escaping projectRoot', () => {
    const commentedConfig = [
      '<generatorConfiguration>',
      '  <context id="active">',
      '    <!-- <javaModelGenerator targetPackage="com.example.commented" targetProject="src/main/java"/> -->',
      '    <javaModelGenerator targetPackage="com.example.escape" targetProject="../../outside"/>',
      '    <javaModelGenerator targetPackage="com.example.valid" targetProject="src/main/java"/>',
      '  </context>',
      '</generatorConfiguration>',
    ].join('\n');
    const root = project({
      'src/main/resources/generatorConfig-dev.xml': commentedConfig,
      'target/classes/generatorConfig.xml':
        '<generatorConfiguration><context><javaModelGenerator targetPackage="com.example.target" targetProject="src/main/java"/></context></generatorConfiguration>',
      'build/resources/generatorConfig.xml':
        '<generatorConfiguration><context><javaModelGenerator targetPackage="com.example.build" targetProject="src/main/java"/></context></generatorConfiguration>',
      'node_modules/pkg/generatorConfig.xml':
        '<generatorConfiguration><context><javaModelGenerator targetPackage="com.example.nm" targetProject="src/main/java"/></context></generatorConfiguration>',
      '.git/generatorConfig.xml':
        '<generatorConfiguration><context><javaModelGenerator targetPackage="com.example.git" targetProject="src/main/java"/></context></generatorConfiguration>',
      'pom.xml':
        '<project><!-- <plugin><artifactId>mybatis-generator-maven-plugin</artifactId><configuration><configurationFile>src/main/resources/ignored.xml</configurationFile></configuration></plugin> --><build><plugins><plugin><artifactId>mybatis-generator-maven-plugin</artifactId><configuration><configurationFile>../../outside.xml</configurationFile></configuration></plugin></plugins></build></project>',
      'src/main/resources/ignored.xml':
        '<generatorConfiguration><context><javaModelGenerator targetPackage="com.example.ignored" targetProject="src/main/java"/></context></generatorConfiguration>',
    });

    expect(configuredGeneratedDirectories(root)).toEqual(['src/main/java/com/example/valid/']);
  });
});
