import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { dynamicUris } from './uri-parsing.mjs';

const IMPORTS = 'import java.net.URI\nimport java.net.URISyntaxException\n\n';

function found(body, header = IMPORTS) {
  const source = `${header}fun link(text: String, path: String): Any? {\n${body}\n}\n`;
  const scanned = scanKotlinSource(source);
  const first = lineOf(scanned, source.indexOf('fun link'));
  return dynamicUris(scanned).map((reported) => lineOf(scanned, reported.offset) - first);
}

describe('dynamicUris', () => {
  it.each([
    ['URI.create on a parameter', '    return URI.create(text)'],
    ['the URI constructor on a parameter', '    return URI(text)'],
    ['a string template', '    return URI.create("https://shop.example/$path")'],
    ['a constant joined with a parameter', '    return URI.create(BASE + path)'],
    [
      'a local read from the environment',
      '    val base = System.getenv("BASE")\n    return URI.create(base)',
    ],
    ['a fully qualified call without the import', '    return java.net.URI.create(text)'],
    [
      'a catch of another exception',
      '    try {\n        return URI.create(text)\n    } catch (e: IllegalStateException) {\n        return null\n    }',
    ],
    [
      'a constructor whose catch takes only IllegalArgumentException',
      '    try {\n        return URI(text)\n    } catch (e: IllegalArgumentException) {\n        return null\n    }',
    ],
    [
      'a call in the catch block',
      '    try {\n        return URI.create(BASE)\n    } catch (e: IllegalArgumentException) {\n        return URI.create(text)\n    }',
    ],
    [
      'a function declared inside a try',
      '    try {\n        fun parse() {\n            URI.create(text)\n        }\n        return parse()\n    } catch (e: Exception) {\n        return null\n    }',
    ],
    [
      'a var set from a literal and reassigned',
      '    var base = "https://a"\n    base = path\n    return URI.create(base)',
    ],
    [
      'a parameter named like a literal property',
      '    return URI.create(text)\n}\n\nclass Holder {\n    val text = "https://a"',
    ],
    [
      'a lambda parameter named like a literal val',
      '    val u = "https://a"\n    return listOf(text).map { u -> URI.create(u) }',
    ],
    [
      'an object property read from the environment',
      '    return URI.create(Config.URL)\n}\n\nobject Config {\n    val URL = System.getenv("URL")',
    ],
    ['a property of a value', '    return URI.create(path.URL)'],
    ['a parameter in capitals', '    return URI.create(BASE)\n}\n\nfun other(BASE: String) {'],
    ['a function reference to URI.create', '    return listOf(text).map(URI::create)'],
    ['a constructor reference', '    return listOf(text).map(::URI)'],
  ])('flags %s', (_name, body) => {
    expect(found(body)).toHaveLength(1);
  });

  it('reports the line of the call', () => {
    expect(found('    val base = path.trim()\n    return URI.create(base)')).toEqual([2]);
  });

  it.each([
    ['a string literal', '    return URI.create("https://shop.example/")'],
    ['a raw string', '    return URI.create("""https://shop.example/""")'],
    ['an escaped dollar sign', '    return URI.create("https://shop.example/\\$price")'],
    ['a constant name', '    return URI.create(BASE)'],
    ['a qualified constant', '    return URI.create(Links.HOME)'],
    ['constants joined', '    return URI.create(BASE + "/help")'],
    [
      'a const val',
      '    return URI.create(HOME)\n}\n\nprivate const val HOME = "https://shop.example/"\n\nfun other() {',
    ],
    ['a local literal', '    val home = "https://shop.example/"\n    return URI.create(home)'],
    ['the encoding constructor', '    return URI("https", "shop.example", path, null)'],
    [
      'a try that catches IllegalArgumentException',
      '    try {\n        return URI.create(text)\n    } catch (e: IllegalArgumentException) {\n        return null\n    }',
    ],
    [
      'a later catch clause that covers it',
      '    try {\n        return URI.create(text)\n    } catch (e: IllegalStateException) {\n        return null\n    } catch (e: RuntimeException) {\n        return null\n    }',
    ],
    [
      'a constructor with URISyntaxException caught',
      '    try {\n        return URI(text)\n    } catch (e: URISyntaxException) {\n        return null\n    }',
    ],
    ['runCatching', '    return runCatching { URI.create(text) }.getOrNull()'],
    ['runCatching on a receiver', '    return text.runCatching { URI(this) }.getOrNull()'],
    [
      'a lambda inside a try',
      '    try {\n        return listOf(text).map { URI.create(it) }\n    } catch (e: IllegalArgumentException) {\n        return null\n    }',
    ],
    ['a try expression', '    return try { URI.create(text) } catch (e: Exception) { null }'],
    ['a comment', '    // URI.create(text)\n    return null'],
    ['text in a string', '    return "URI.create(text)"'],
    ['runCatching with parentheses', '    return runCatching() { URI.create(text) }.getOrNull()'],
    [
      'a function reference in a handled try',
      '    try {\n        return listOf(text).map(URI::create)\n    } catch (e: IllegalArgumentException) {\n        return null\n    }',
    ],
  ])('passes %s', (_name, body) => {
    expect(found(body)).toEqual([]);
  });

  it('passes another URI type that is not java.net.URI', () => {
    expect(found('    return URI.create(text)', 'import com.example.URI\n\n')).toEqual([]);
  });

  it('passes a class named URI and the function that declares it', () => {
    expect(
      found('    return null\n}\n\nclass URI(val text: String)\n\nfun URI(value: Int) {', ''),
    ).toEqual([]);
  });

  it('flags URI.create when the whole package is imported', () => {
    expect(found('    return URI.create(text)', 'import java.net.*\n\n')).toEqual([1]);
  });
});
