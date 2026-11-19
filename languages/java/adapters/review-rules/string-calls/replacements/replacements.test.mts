import { describe, expect, it } from 'vitest';
import {
  type LocatedFinding,
  type ReadFindings,
  ruleLineRunners,
} from '../../test-support/scratch-scanner.mts';
import {
  EXPANDING_REPLACEMENT_RULE,
  readStringCallFindings as untypedRead,
} from '../string-calls.mjs';

const read: ReadFindings<LocatedFinding> = untypedRead;

const { java, kotlin } = ruleLineRunners({
  prefix: 'nitpicker-jvm-replacement-',
  read,
  rule: EXPANDING_REPLACEMENT_RULE,
  className: 'Fill',
  javaImports: 'import java.util.regex.Matcher;\n',
});

describe('Java expanding replacements', () => {
  it('reports a runtime replacement given to replaceAll or replaceFirst', () => {
    expect(
      java(
        'String fill(String text, String name) {\n  return text.replaceAll("\\\\{name}", name);\n}',
      ),
    ).toEqual([5]);
    expect(
      java(
        'String fill(String path, String ns) {\n  return path.replaceFirst("^/api", "/" + ns + "/api");\n}',
      ),
    ).toEqual([5]);
    expect(
      java(
        'String fill(Matcher matcher, String name) {\n  return matcher.replaceAll(name.trim());\n}',
      ),
    ).toEqual([5]);
  });

  it('leaves constants, quoted values and literal replace alone', () => {
    expect(java('String fill(String text) {\n  return text.replaceAll("(a)", "$1b");\n}')).toEqual(
      [],
    );
    expect(
      java(
        'static final String NAME = "x";\nString fill(String text) {\n  return text.replaceAll("a", NAME);\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String fill(String text, String name) {\n  return text.replaceAll("a", Matcher.quoteReplacement(name));\n}',
      ),
    ).toEqual([]);
    expect(
      java('String fill(String text, String name) {\n  return text.replace("{name}", name);\n}'),
    ).toEqual([]);
    expect(
      java(
        'String fill(String text, boolean on, int n) {\n  return text.replaceAll("a", String.format("x: %s %d\\n", on, n));\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String fill(String text, boolean on) {\n  return text.replaceAll("a", "x: %s".formatted(on));\n}',
      ),
    ).toEqual([]);
    expect(
      java('String fill(String text, Kind kind) {\n  return text.replaceAll("a", kind.name());\n}'),
    ).toEqual([]);
    expect(
      java(
        'enum Kind { A }\nString fill(String text, Kind kind) {\n  return text.replaceAll("a", kind.value());\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'String fill(Matcher matcher) {\n  return matcher.replaceAll(result -> result.group(1));\n}',
      ),
    ).toEqual([]);
    expect(
      java(
        'void fill(java.util.List<String> items, java.util.function.UnaryOperator<String> op) {\n  items.replaceAll(op);\n}',
      ),
    ).toEqual([]);
  });
});

describe('Kotlin expanding replacements', () => {
  it('reports a runtime replacement given to a Regex', () => {
    expect(
      kotlin('fun fill(text: String, name: String): String =\n  text.replace(Regex("a"), name)'),
    ).toEqual([4]);
    expect(
      kotlin(
        'val PLACEHOLDER = Regex("a")\nfun fill(text: String, name: String): String =\n  PLACEHOLDER.replace(text, "<$name>")',
      ),
    ).toEqual([5]);
    expect(
      kotlin(
        'fun fill(text: String, name: String): String =\n  text.replaceFirst("a".toRegex(), name)',
      ),
    ).toEqual([4]);
  });

  it('leaves constants, escaped values, lambdas and string replace alone', () => {
    expect(kotlin('fun fill(text: String): String =\n  text.replace(Regex("(a)"), "$1b")')).toEqual(
      [],
    );
    expect(
      kotlin(
        'fun fill(text: String, name: String): String =\n  text.replace(Regex("a"), Regex.escapeReplacement(name))',
      ),
    ).toEqual([]);
    expect(
      kotlin('fun fill(text: String, name: String): String =\n  text.replace(Regex("a")) { name }'),
    ).toEqual([]);
    expect(
      kotlin('fun fill(text: String, name: String): String =\n  text.replace("{name}", name)'),
    ).toEqual([]);
  });
});
