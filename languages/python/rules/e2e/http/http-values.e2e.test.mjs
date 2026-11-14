import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, verdicts } = createScripts();
afterEach(cleanup);

const CASE = 'http-value-case';
const SPLIT = 'hand-split-http-header';

function sites(cases) {
  return Object.fromEntries(
    Object.entries(verdicts(Object.fromEntries(cases.map(([name, code]) => [name, code])))).map(
      ([name, found]) => [name, found.map((item) => item.split(' ')[0])],
    ),
  );
}

function expectations(cases) {
  return Object.fromEntries(cases.map(([name, , found]) => [name, found]));
}

describe.skipIf(!enabled)('http-value-case', () => {
  it('flags a header value, netloc, cookie prefix or file extension compared by exact case', () => {
    const cases = [
      [
        'a header value equal to a literal',
        'def is_json(request):\n    return request.headers["Content-Type"] == "application/json"\n',
        [`${CASE}:2`],
      ],
      [
        'a get with a default',
        'def is_html(request):\n    return request.headers.get("accept", "") == "text/html"\n',
        [`${CASE}:2`],
      ],
      [
        'a value through a local and startswith',
        'def is_form(request):\n    kind = request.headers.get("Content-Type")\n    return kind.startswith("multipart/")\n',
        [`${CASE}:3`],
      ],
      [
        'a membership test in a literal tuple',
        'def is_text(request):\n    return request.headers["content-type"] in ("text/plain", "text/html")\n',
        [`${CASE}:2`],
      ],
      [
        'a literal substring of the value',
        'def gzipped(request):\n    return "gzip" in request.headers.get("Accept-Encoding", "")\n',
        [`${CASE}:2`],
      ],
      [
        'a request content type attribute',
        'def is_json(request):\n    return request.content_type == "application/json"\n',
        [`${CASE}:2`],
      ],
      [
        'a match statement',
        'def kind(request):\n    match request.headers["accept"]:\n        case "text/html":\n            return 1\n    return 0\n',
        [`${CASE}:2`],
      ],
      [
        'a table lookup by the value',
        'HANDLERS = {}\n\n\ndef handler(request):\n    return HANDLERS[request.headers["content-type"]]\n',
        [`${CASE}:5`],
      ],
      [
        'a regular expression without a flag',
        'import re\n\n\ndef is_json(request):\n    return re.match(r"application/json", request.headers["content-type"])\n',
        [`${CASE}:5`],
      ],
      [
        'a netloc compared with a literal',
        'from urllib.parse import urlparse\n\n\ndef local(url):\n    return urlparse(url).netloc == "example.com"\n',
        [`${CASE}:5`],
      ],
      [
        'a cookie name prefix',
        'def host_only(name):\n    return name.startswith("__Host-")\n',
        [`${CASE}:2`],
      ],
      [
        'a MIME table keyed by a splitext extension',
        'import os\n\nMIME_TYPES = {".png": "image/png"}\n\n\ndef mime(path):\n    ext = os.path.splitext(path)[1]\n    return MIME_TYPES[ext]\n',
        [`${CASE}:8`],
      ],
      [
        'a MIME table keyed by a path suffix',
        'from pathlib import Path\n\nMIME_TYPES = {}\n\n\ndef mime(path):\n    return MIME_TYPES.get(Path(path).suffix)\n',
        [`${CASE}:7`],
      ],
      [
        'a header name read from a dict copy',
        'def type_of(request):\n    headers = dict(request.headers)\n    return headers["Content-Type"]\n',
        [`${CASE}:3`],
      ],
    ];
    expect(sites(cases)).toEqual(expectations(cases));
  });

  it('accepts a normalised value, a parser, a header name lookup and other text', () => {
    const cases = [
      [
        'a lowered value',
        'def is_json(request):\n    return request.headers["Content-Type"].lower() == "application/json"\n',
        [],
      ],
      [
        'a casefolded local',
        'def is_form(request):\n    kind = request.headers.get("Content-Type", "").casefold()\n    return kind.startswith("multipart/")\n',
        [],
      ],
      [
        'a regular expression with a flag',
        'import re\n\n\ndef is_json(request):\n    return re.match(r"application/json", request.headers["content-type"], re.I)\n',
        [],
      ],
      [
        'a parser',
        'from werkzeug.http import parse_options_header\n\n\ndef is_json(request):\n    kind, _ = parse_options_header(request.headers["content-type"])\n    return kind == "application/json"\n',
        [],
      ],
      [
        'an opaque header',
        'def mine(request):\n    return request.headers["x-request-id"] == "abc"\n',
        [],
      ],
      [
        'a value compared with a variable',
        'def same(request, expected):\n    return request.headers["content-type"] == expected\n',
        [],
      ],
      [
        'a header name in the request mapping',
        'def type_of(request):\n    return request.headers["Content-Type"]\n',
        [],
      ],
      [
        'a lowered cookie name',
        'def host_only(name):\n    return name.lower().startswith("__host-")\n',
        [],
      ],
      [
        'a lowered extension',
        'import os\n\nMIME_TYPES = {}\n\n\ndef mime(path):\n    return MIME_TYPES[os.path.splitext(path)[1].lower()]\n',
        [],
      ],
      [
        'a size table keyed by the extension',
        'import os\n\nSIZES = {}\n\n\ndef size(path):\n    return SIZES[os.path.splitext(path)[1]]\n',
        [],
      ],
      [
        'a scheme of a parsed URL',
        'from urllib.parse import urlparse\n\n\ndef secure(url):\n    return urlparse(url).scheme == "https"\n',
        [],
      ],
      ['an HTTP method', 'def is_get(request):\n    return request.method == "GET"\n', []],
      [
        'a local that is assigned twice',
        'def f(request):\n    kind = request.headers["accept"]\n    kind = kind.lower()\n    return kind == "text/html"\n',
        [],
      ],
    ];
    expect(sites(cases)).toEqual(expectations(cases));
  });
});

describe.skipIf(!enabled)('hand-split-http-header', () => {
  it('flags a structured header split by hand', () => {
    const cases = [
      [
        'a comma split of Accept',
        'def types(request):\n    return request.headers["Accept"].split(",")\n',
        [`${SPLIT}:2`],
      ],
      [
        'a semicolon split of Content-Type',
        'def charset(request):\n    return request.headers.get("content-type", "").split(";")[1]\n',
        [`${SPLIT}:2`],
      ],
      [
        'a split of a local',
        'def cookies(request):\n    raw = request.headers.get("Cookie")\n    return raw.split("; ")\n',
        [`${SPLIT}:3`],
      ],
      [
        'a regular expression split',
        'import re\n\n\ndef tags(request):\n    return re.split(r"\\s*,\\s*", request.headers["if-none-match"])\n',
        [`${SPLIT}:5`],
      ],
      [
        'a partition on a semicolon',
        'def kind(request):\n    return request.headers["content-type"].partition(";")[0]\n',
        [`${SPLIT}:2`],
      ],
    ];
    expect(sites(cases)).toEqual(expectations(cases));
  });

  it('accepts other headers, other separators and parsers', () => {
    const cases = [
      [
        'a forwarded-for list',
        'def hops(request):\n    return request.headers["x-forwarded-for"].split(",")\n',
        [],
      ],
      [
        'a slash split',
        'def parts(request):\n    return request.headers["content-type"].split("/")\n',
        [],
      ],
      [
        'a parser',
        'from werkzeug.http import parse_accept_header\n\n\ndef types(request):\n    return parse_accept_header(request.headers["accept"])\n',
        [],
      ],
      ['text that is not a header', 'def parts(text):\n    return text.split(",")\n', []],
    ];
    expect(sites(cases)).toEqual(expectations(cases));
  });
});
