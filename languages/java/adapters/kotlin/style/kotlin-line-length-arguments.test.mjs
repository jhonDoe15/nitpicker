import { afterEach, describe, expect, it } from 'vitest';
import { kotlinGradleArguments, kotlinStyleFile, resolveKotlinTools } from '../kotlin-tools.mjs';
import { kotlinProjects } from '../test-support/kotlin-project.mjs';
import { kotlinSummary } from './kotlin-format-advice.mjs';

const WIDE = { 'kotlin.lineLength': '120' };
const { project, remove } = kotlinProjects();

afterEach(remove);

const toolsOf = (root, options = {}) => resolveKotlinTools(root, options);

describe('kotlin.lineLength reaches the tools', () => {
  it('writes max_line_length into the ktlint defaults and the detekt layer', () => {
    const root = project({ 'build.gradle.kts': 'ktlint' });
    const tools = toolsOf(root, { conventions: WIDE });

    expect(kotlinStyleFile(tools, WIDE)).toEqual({
      offset: '',
      editorconfigs: [{ path: '.editorconfig', text: 'root = true\n' }],
      ktlintDefaults: '[*.{kt,kts}]\nmax_line_length = 120\n',
      detektConventions: 'style:\n  MaxLineLength:\n    maxLineLength: 120\n',
    });
    expect(kotlinGradleArguments(root, { conventions: WIDE })).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktlint',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
      '-Pnitpicker.kotlin.detektLayers=conventions',
    ]);
  });

  it('passes --max-width to ktfmt and prints it in the format command', () => {
    const root = project({ 'build.gradle.kts': 'ktfmt()' });
    const tools = toolsOf(root, { conventions: WIDE });

    expect(kotlinGradleArguments(root, { conventions: WIDE })).toEqual([
      '-Pnitpicker.kotlin=true',
      '-Pnitpicker.kotlin.formatter=ktfmt',
      '-Pnitpicker.kotlin.ktfmtStyle=meta',
      '-Pnitpicker.kotlin.ktfmtMaxWidth=120',
      '-Pnitpicker.kotlin.detektLayers=conventions',
    ]);
    expect(kotlinSummary(tools, WIDE)).toEqual([
      'Format with ktfmt: ktfmt --meta-style --max-width=120 <Kotlin files>',
    ]);
  });

  it('adds nothing when no width was measured', () => {
    const root = project({ 'build.gradle.kts': 'ktfmt()' });

    expect(kotlinGradleArguments(root, {}).filter((argument) => /MaxWidth/.test(argument))).toEqual(
      [],
    );
    expect(kotlinSummary(toolsOf(root), {})).toEqual([
      'Format with ktfmt: ktfmt --meta-style <Kotlin files>',
    ]);
  });
});
