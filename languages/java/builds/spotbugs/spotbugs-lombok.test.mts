import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { declaredProcessorKind, lombokMarksGenerated, processorKind } from './spotbugs-lombok.mts';
import { zipOf } from '../../../../shared/test-support/archives/zip-writer.mts';

const projectWith = useTempProjects('nitpicker-spotbugs-lombok-');
const SERVICE = 'META-INF/services/javax.annotation.processing.Processor';

function processors(root: string, name: string, listed: string): string {
  const entry = path.join(root, name);
  mkdirSync(path.join(entry, 'META-INF/services'), { recursive: true });
  writeFileSync(path.join(entry, SERVICE), listed);
  return entry;
}

describe('processorKind', () => {
  it('tells Lombok apart from other annotation processors', () => {
    const root = projectWith({});
    const lombok = processors(
      root,
      'lombok',
      '# Lombok\nlombok.launch.AnnotationProcessorHider$AnnotationProcessor\n',
    );
    const other = processors(root, 'other', 'org.example.Processor\n');
    const empty = processors(root, 'empty', '\n');

    expect(processorKind([])).toBe('none');
    expect(processorKind([empty, path.join(root, 'missing.jar')])).toBe('none');
    expect(processorKind([lombok])).toBe('lombok');
    expect(processorKind([lombok, other])).toBe('other');
  });

  it('passes over processors that only write new files', () => {
    const root = projectWith({});
    const lombok = processors(
      root,
      'lombok',
      'lombok.launch.AnnotationProcessorHider$AnnotationProcessor\n',
    );
    const service = processors(
      root,
      'service',
      'com.google.auto.service.processor.AutoServiceProcessor\n',
    );
    const mapper = path.join(root, 'mapstruct.jar');
    writeFileSync(
      mapper,
      zipOf({ [SERVICE]: 'org.mapstruct.ap.MappingProcessor\n', 'a/B.class': 'x' }),
    );

    expect(processorKind([service, mapper])).toBe('none');
    expect(processorKind([lombok, mapper])).toBe('lombok');
  });

  it('reads the processors of the declared processor path from its coordinates', () => {
    expect(declaredProcessorKind([])).toBe('none');
    expect(declaredProcessorKind(['org.projectlombok:lombok:1.18.36'])).toBe('lombok');
    expect(
      declaredProcessorKind([
        'org.projectlombok:lombok:1.18.36',
        'org.projectlombok:lombok-mapstruct-binding:0.2.0',
        'org.mapstruct:mapstruct-processor:1.6.3',
      ]),
    ).toBe('lombok');
    expect(declaredProcessorKind(['org.example:processor:1', 'org.projectlombok:lombok:1'])).toBe(
      'other',
    );
  });

  it('counts an archive it cannot read as an unknown processor', () => {
    const root = projectWith({ 'broken.jar': 'not a zip' });

    expect(processorKind([path.join(root, 'broken.jar')])).toBe('other');
  });

  it('counts a service file it cannot read as an unknown processor', () => {
    const root = projectWith({});
    mkdirSync(path.join(root, 'odd', SERVICE), { recursive: true });

    expect(processorKind([path.join(root, 'odd')])).toBe('other');
  });
});

describe('lombokMarksGenerated', () => {
  it('is false once a lombok.config above a source turns the Generated annotation off', () => {
    const root = projectWith({
      'a/src/p/A.java': 'class A {}',
      'a/lombok.config': 'config.stopBubbling = true\n',
      'b/src/p/B.java': 'class B {}',
      'b/lombok.config': 'lombok.addLombokGeneratedAnnotation = false\n',
    });

    expect(lombokMarksGenerated([path.join(root, 'a/src/p/A.java')])).toBe(true);
    expect(lombokMarksGenerated([path.join(root, 'b/src/p/B.java')])).toBe(false);
  });

  it('follows imports and is false when one cannot be followed or a config cannot be read', () => {
    const root = projectWith({
      'a/src/p/A.java': 'class A {}',
      'a/lombok.config': 'import ../shared/lombok.config\n',
      'shared/lombok.config': 'lombok.addLombokGeneratedAnnotation = false\n',
      'b/src/p/B.java': 'class B {}',
      'c/src/p/C.java': 'class C {}',
      'c/lombok.config': 'import ~/lombok.config\n',
      'd/src/p/D.java': 'class D {}',
      'd/lombok.config':
        'import ../missing/lombok.config\nlombok.addLombokGeneratedAnnotation = true\n',
    });
    mkdirSync(path.join(root, 'b/lombok.config'));

    expect(lombokMarksGenerated([path.join(root, 'a/src/p/A.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'b/src/p/B.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'c/src/p/C.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'd/src/p/D.java')])).toBe(true);
  });

  it('takes the last value from the outermost config to the nearest, as Lombok does', () => {
    const root = projectWith({
      'lombok.config': 'lombok.addLombokGeneratedAnnotation = false\n',
      'on/lombok.config': 'lombok.addLombokGeneratedAnnotation = TRUE # back on\n',
      'on/src/A.java': 'class A {}',
      'cleared/lombok.config': 'clear lombok.addLombokGeneratedAnnotation\n',
      'cleared/src/B.java': 'class B {}',
      'stop/lombok.config': 'config.stopBubbling = true\n',
      'stop/src/C.java': 'class C {}',
      'twice/src/lombok.config':
        'lombok.addLombokGeneratedAnnotation = false\nlombok.addLombokGeneratedAnnotation = true\n',
      'twice/src/F.java': 'class F {}',
      'off/src/D.java': 'class D {}',
      'odd/src/lombok.config': 'lombok.addLombokGeneratedAnnotation = maybe\n',
      'odd/src/E.java': 'class E {}',
    });

    expect(lombokMarksGenerated([path.join(root, 'on/src/A.java')])).toBe(true);
    expect(lombokMarksGenerated([path.join(root, 'cleared/src/B.java')])).toBe(true);
    expect(lombokMarksGenerated([path.join(root, 'stop/src/C.java')])).toBe(true);
    expect(lombokMarksGenerated([path.join(root, 'off/src/D.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'odd/src/E.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'twice/src/F.java')])).toBe(true);
    expect(
      lombokMarksGenerated([path.join(root, 'on/src/A.java'), path.join(root, 'stop/src/C.java')]),
    ).toBe(true);
    expect(lombokMarksGenerated([path.join(root, 'on/src/A.java')], false)).toBe(true);
    expect(lombokMarksGenerated([path.join(root, 'cleared/src/B.java')], false)).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'stop/src/C.java')], false)).toBe(false);
  });

  it('is false when a config changes the names of the accessors Lombok writes', () => {
    const root = projectWith({
      'a/src/A.java': 'class A {}',
      'a/lombok.config': 'lombok.accessors.fluent = true\n',
      'b/src/B.java': 'class B {}',
      'b/lombok.config': 'import ../shared.config\n',
      'shared.config': 'lombok.getter.noIsPrefix = true\n',
      'c/src/C.java': 'class C {}',
      'c/lombok.config': 'lombok.accessors.chain = true\nlombok.accessors.prefix += m\n',
      'd/src/D.java': 'class D {}',
      'd/lombok.config': 'lombok.accessors.chain = true\n',
    });

    expect(lombokMarksGenerated([path.join(root, 'a/src/A.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'b/src/B.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'c/src/C.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'd/src/D.java')])).toBe(true);
  });
});
