import { describe, expect, it } from 'vitest';
import { foundRuleLines } from '../typed/scan-found.mts';
import { type Check, type Ruled } from '../typed/typed-scan.mts';
import { httpValues as untypedHttpValues } from './http-values.mjs';

const httpValues: Check<Ruled> = untypedHttpValues;
const WEB = 'class Web {';

function found(lines: string[]): (string | number)[][] {
  return foundRuleLines(httpValues, [WEB, ...lines, '}', ''].join('\n'));
}

describe('httpValues', () => {
  it.each([
    [
      'a header value equals a literal',
      'fun json(request: HttpServletRequest) = request.getHeader("Content-Type") == "application/json"',
    ],
    [
      'equals on a header',
      'fun json(request: HttpServletRequest) = request.getHeader("Accept")?.equals("text/html")',
    ],
    [
      'a literal on the left',
      'fun json(request: HttpServletRequest) = "https" == request.getHeader("X-Forwarded-Proto")',
    ],
    [
      'startsWith on the content type',
      'fun form(request: HttpServletRequest) = request.contentType?.startsWith("multipart/") == true',
    ],
    [
      'a header read by index',
      'fun form(headers: HttpHeaders) = headers[HttpHeaders.CONTENT_TYPE]?.startsWith("text/")',
    ],
    [
      'a local that holds the header',
      'fun f(request: HttpServletRequest): Boolean {\n        val type = request.getHeader("Content-Type")\n        return type == "text/plain"\n    }',
    ],
    ['a URI scheme', 'fun secure(uri: URI) = uri.scheme == "https"'],
    ['a URI host', 'fun local(uri: URI) = uri.host.endsWith("example.com")'],
    [
      'a when over a header',
      'fun f(request: HttpServletRequest) = when (request.getHeader("Accept")) {\n        "text/html" -> 1\n        else -> 0\n    }',
    ],
    [
      'a set lookup',
      'fun f(headers: HttpHeaders) = TEXT.contains(headers.getFirst(HttpHeaders.CONTENT_TYPE))',
    ],
    [
      'a request header parameter',
      'fun f(@RequestHeader("Accept") accept: String): Boolean {\n        return accept.contains("json")\n    }',
    ],
  ])('flags %s', (_name, line) => {
    expect(found([line]).map(([rule]) => rule)).toEqual(['HttpValueCase']);
  });

  it.each([
    [
      'a lowercased header',
      'fun json(request: HttpServletRequest) = request.getHeader("Content-Type")?.lowercase() == "application/json"',
    ],
    [
      'ignoreCase',
      'fun json(request: HttpServletRequest) = request.getHeader("Accept")?.equals("text/html", ignoreCase = true)',
    ],
    [
      'startsWith with ignoreCase',
      'fun f(request: HttpServletRequest) = request.contentType.startsWith("text/", ignoreCase = true)',
    ],
    [
      'a parsed media type',
      'fun f(request: HttpServletRequest) = MediaType.parseMediaType(request.getHeader("Content-Type")) == JSON',
    ],
    [
      'an opaque header',
      'fun f(request: HttpServletRequest) = request.getHeader("X-Request-Id") == "abc"',
    ],
    [
      'a content length',
      'fun f(request: HttpServletRequest) = request.getHeader("Content-Length") == "0"',
    ],
    [
      'a null check',
      'fun f(request: HttpServletRequest) = request.getHeader("Content-Type") == null',
    ],
    ['a method', 'fun f(request: HttpServletRequest) = request.method == "GET"'],
    ['a lowered scheme', 'fun secure(uri: URI) = uri.scheme.lowercase() == "https"'],
    ['a scheme with equals ignoreCase', 'fun secure(uri: URI) = uri.scheme.equals("https", true)'],
    ['a name lookup on headers', 'fun f(headers: HttpHeaders) = headers.getFirst("Content-Type")'],
    [
      'a header against a variable',
      'fun f(request: HttpServletRequest, t: String) = request.getHeader("Accept") == t',
    ],
    [
      'a lowered local',
      'fun f(request: HttpServletRequest): Boolean {\n        val type = request.getHeader("Content-Type")\n        return type?.lowercase() == "text/plain"\n    }',
    ],
    [
      'a reassigned name outside the scope',
      'fun f(request: HttpServletRequest): Boolean {\n        val type = request.getHeader("Content-Type")?.lowercase()\n        return type == "text/plain"\n    }',
    ],
    ['text in a string', 'val hint = "request.getHeader(\\"Accept\\") == \\"x\\""'],
  ])('accepts %s', (_name, line) => {
    expect(found([line])).toEqual([]);
  });

  it.each([
    [
      'a split on a comma',
      'fun f(request: HttpServletRequest) = request.getHeader("Accept").split(",")',
    ],
    [
      'a split on a semicolon',
      'fun f(request: HttpServletRequest) = request.contentType.split(";")',
    ],
    [
      'a split with a regex',
      'fun f(headers: HttpHeaders) = headers["Cookie"]!!.split(Regex("\\\\s*;\\\\s*"))',
    ],
    [
      'a split of a local',
      'fun f(request: HttpServletRequest): List<String> {\n        val accept = request.getHeader("Accept-Encoding")\n        return accept.split(", ")\n    }',
    ],
  ])('flags %s as a hand split', (_name, line) => {
    expect(found([line]).map(([rule]) => rule)).toEqual(['HandSplitHttpHeader']);
  });

  it.each([
    [
      'a forwarded-for list',
      'fun f(request: HttpServletRequest) = request.getHeader("X-Forwarded-For").split(",")',
    ],
    ['a split on a slash', 'fun f(request: HttpServletRequest) = request.contentType.split("/")'],
    ['a split of another string', 'fun f(text: String) = text.split(",")'],
  ])('accepts %s', (_name, line) => {
    expect(found([line])).toEqual([]);
  });

  it.each([
    ['a cookie prefix', 'fun f(name: String) = name.startsWith("__Host-")'],
    ['a secure prefix', 'fun f(name: String) = name.startsWith("__Secure-")'],
    ['an inline extension lookup', 'fun f(file: File) = MIME_TYPES[file.extension]'],
    ['a get on an extension', "fun f(name: String) = mimeTypes.get(name.substringAfterLast('.'))"],
    [
      'a local extension',
      'fun f(file: File): String? {\n        val ext = file.extension\n        return MIME_TYPES[ext]\n    }',
    ],
  ])('flags %s', (_name, line) => {
    expect(found([line]).map(([rule]) => rule)).toEqual(['HttpValueCase']);
  });

  it.each([
    ['a lowered cookie name', 'fun f(name: String) = name.lowercase().startsWith("__host-")'],
    ['an ignoreCase prefix', 'fun f(name: String) = name.startsWith("__Host-", ignoreCase = true)'],
    ['another prefix', 'fun f(name: String) = name.startsWith("session-")'],
    ['a lowered extension', 'fun f(file: File) = MIME_TYPES[file.extension.lowercase()]'],
    ['a size table', 'fun f(file: File) = SIZES[file.extension]'],
    [
      'a lowered local extension',
      'fun f(file: File): String? {\n        val ext = file.extension.lowercase()\n        return MIME_TYPES[ext]\n    }',
    ],
  ])('accepts %s', (_name, line) => {
    expect(found([line])).toEqual([]);
  });
});
