import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { lombokMarksGenerated, processorKind } from './spotbugs-lombok.mts';

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

  it('is false when a lombok.config imports another or cannot be read', () => {
    const root = projectWith({
      'a/src/p/A.java': 'class A {}',
      'a/lombok.config': 'import ../shared/lombok.config\n',
      'b/src/p/B.java': 'class B {}',
    });
    mkdirSync(path.join(root, 'b/lombok.config'));

    expect(lombokMarksGenerated([path.join(root, 'a/src/p/A.java')])).toBe(false);
    expect(lombokMarksGenerated([path.join(root, 'b/src/p/B.java')])).toBe(false);
  });
});
