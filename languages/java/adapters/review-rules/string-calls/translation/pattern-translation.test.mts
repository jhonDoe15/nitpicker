import { describe, expect, it } from 'vitest';
import {
  type LocatedFinding,
  type ReadFindings,
  ruleLineRunners,
} from '../../test-support/scratch-scanner.mts';
import {
  PATTERN_TRANSLATION_RULE,
  readStringCallFindings as untypedRead,
} from '../string-calls.mjs';

const read: ReadFindings<LocatedFinding> = untypedRead;

const { java, kotlin } = ruleLineRunners({
  prefix: 'nitpicker-jvm-translation-',
  read,
  rule: PATTERN_TRANSLATION_RULE,
  className: 'Globs',
  javaImports: 'import java.util.regex.Pattern;\n',
});

describe('Java pattern translation', () => {
  it('reports a glob turned into a regex without quoting', () => {
    expect(
      java(
        'Pattern compile(String glob) {\n  String regex = glob.replace("**", ".*").replace("*", "[^/]*");\n  return Pattern.compile("^" + regex + "$");\n}',
      ),
    ).toEqual([5]);
    expect(
      java(
        'Pattern direct(String glob) {\n  return Pattern.compile(glob.replaceAll("\\\\*", ".*").replaceAll("\\\\?", "."));\n}',
      ),
    ).toEqual([5]);
  });

  it('reports a pattern turned into LIKE without escaping', () => {
    expect(
      java('String like(String glob) {\n  return glob.replace("*", "%").replace("?", "_");\n}'),
    ).toEqual([5]);
  });

  it('leaves quoted, escaped, constant and unrelated chains alone', () => {
    expect(
      java(
        'Pattern quoted(String glob) {\n  return Pattern.compile(Pattern.quote(glob).replace("*", ".*").replace("?", "."));\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String like(String glob) {\n  return glob.replace("%", "\\\\%").replace("_", "\\\\_").replace("*", "%");\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'Pattern constant() {\n  return Pattern.compile("src/**/*.java".replace("**", ".*").replace("*", "[^/]*"));\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String label(String glob) {\n  return glob.replace("**", ".*").replace("*", "[^/]*");\n}',
      ),
    ).toEqual([]);
    expect(
      java('Pattern single(String glob) {\n  return Pattern.compile(glob.replace("*", ".*"));\n}'),
    ).toEqual([]);
    expect(
      java(
        'Pattern slug(String text) {\n  return Pattern.compile(text.replace(" ", "-").replace("_", "-"));\n}',
      ),
    ).toEqual([]);
  });
});

describe('Kotlin pattern translation', () => {
  it('reports a glob turned into a Regex and a LIKE pattern', () => {
    expect(
      kotlin(
        'fun compile(glob: String): Regex =\n  Regex(glob.replace("**", ".*").replace("*", "[^/]*"))',
      ),
    ).toEqual([4]);
    expect(
      kotlin('fun like(glob: String): String =\n  glob.replace("*", "%").replace("?", "_")'),
    ).toEqual([4]);
    expect(
      kotlin(
        'fun compile(glob: String): Regex {\n  val source = glob.replace("**", ".*").replace("*", "[^/]*")\n  return source.toRegex()\n}',
      ),
    ).toEqual([4]);
  });

  it('leaves a quoted value and a chain that is not a regex alone', () => {
    expect(
      kotlin(
        'fun compile(glob: String): Regex =\n  Regex(Regex.escape(glob).replace("\\\\*", ".*").replace("\\\\?", "."))',
      ),
    ).toEqual([]);
    expect(
      kotlin('fun label(glob: String): String =\n  glob.replace("**", ".*").replace("*", "[^/]*")'),
    ).toEqual([]);
  });
});
