import {
  useRuleScripts,
  pythonLines as code,
  ruleLine,
} from '../../test-support/python-rule-scripts.mts';

const RULE = 'except-misses-raised-exception';
const found = ruleLine(RULE);
const { itOutcomes, describeRules } = useRuleScripts(RULE, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const JSON = ['import json', 'from json import JSONDecodeError', '', ''];
const DATES = ['from datetime import datetime, timedelta', '', ''];

describeRules(RULE, () => {
  itOutcomes('reports a handler that misses an exception of a standard library call', [
    [
      'json loads guarded by JSONDecodeError only',
      code(
        ...JSON,
        'def parse(text):',
        '    try:',
        '        return json.loads(text)',
        '    except JSONDecodeError:',
        '        return None',
      ),
      [found(7, 'json.loads() misses ValueError')],
    ],
    [
      'a request body guarded by JSONDecodeError only',
      code(
        ...JSON,
        'async def read(request):',
        '    try:',
        '        body = await request.json()',
        '    except json.JSONDecodeError:',
        '        raise HTTPException(400)',
        '    return body',
      ),
      [found(7, 'request.json() misses ValueError')],
    ],
    [
      'suppress around a response body parse',
      code(
        'import contextlib',
        'from json import JSONDecodeError',
        '',
        '',
        'def audit(response):',
        '    with contextlib.suppress(JSONDecodeError):',
        '        return response.json()',
      ),
      [found(7, 'response.json() misses ValueError')],
    ],
    [
      'a timedelta built from user input',
      code(
        ...DATES,
        'def span(value):',
        '    try:',
        '        return timedelta(**value)',
        '    except (ValueError, TypeError):',
        '        raise ValueError("invalid")',
      ),
      [found(6, 'datetime.timedelta() misses OverflowError')],
    ],
  ]);

  itOutcomes('stays quiet when the handler covers the call or is not about it', [
    [
      'literal_eval that misses the rare exceptions',
      code(
        'import ast',
        '',
        '',
        'def convert(text):',
        '    try:',
        '        return ast.literal_eval(text)',
        '    except (ValueError, SyntaxError):',
        '        return text',
      ),
      [],
    ],
    [
      'a timestamp and a datetime that catch ValueError only',
      code(
        ...DATES,
        'def when(value, year):',
        '    try:',
        '        return datetime.fromtimestamp(value), datetime(year, 1, 1)',
        '    except ValueError:',
        '        return None',
      ),
      [],
    ],
    [
      'int of a float and struct unpack with a ValueError handler',
      code(
        'import struct',
        '',
        '',
        'def read(text, data):',
        '    try:',
        '        return int(float(text)), struct.unpack("<I", data)',
        '    except (ValueError, TypeError):',
        '        return None',
      ),
      [],
    ],
    [
      'a common base for json',
      code(
        ...JSON,
        'def parse(text):',
        '    try:',
        '        return json.loads(text)',
        '    except ValueError:',
        '        return None',
      ),
      [],
    ],
    [
      'any failure',
      code(
        ...JSON,
        'def parse(text):',
        '    try:',
        '        return json.loads(text)',
        '    except Exception:',
        '        return None',
      ),
      [],
    ],
    [
      'a bare except',
      code(
        ...JSON,
        'def parse(text):',
        '    try:',
        '        return json.loads(text)',
        '    except:',
        '        return None',
      ),
      [],
    ],
    [
      'a handler for an unrelated failure',
      code(
        ...JSON,
        'def parse(text, data):',
        '    try:',
        '        value = json.loads(text)',
        '        return data[value]',
        '    except KeyError:',
        '        return None',
      ),
      [],
    ],
    [
      'a handler that only raises again',
      code(
        ...JSON,
        'def parse(text):',
        '    try:',
        '        return json.loads(text)',
        '    except JSONDecodeError:',
        '        raise',
      ),
      [],
    ],
    [
      'literal_eval with every exception',
      code(
        'import ast',
        '',
        '',
        'def convert(text):',
        '    try:',
        '        return ast.literal_eval(text)',
        '    except (ValueError, TypeError, SyntaxError, MemoryError, RecursionError):',
        '        return text',
      ),
      [],
    ],
    [
      'literal_eval with a base class for the rest',
      code(
        'import ast',
        '',
        '',
        'def convert(text):',
        '    try:',
        '        return ast.literal_eval(text)',
        '    except (ValueError, TypeError, SyntaxError, MemoryError, RuntimeError):',
        '        return text',
      ),
      [],
    ],
    [
      'a timestamp with both exceptions',
      code(
        ...DATES,
        'def when(value):',
        '    try:',
        '        return datetime.fromtimestamp(value)',
        '    except (ValueError, OverflowError):',
        '        return None',
      ),
      [],
    ],
    [
      'a timedelta from constants',
      code(
        ...DATES,
        'def day():',
        '    try:',
        '        return timedelta(days=1)',
        '    except ValueError:',
        '        return None',
      ),
      [],
    ],
    [
      'a struct error handler',
      code(
        'import struct',
        '',
        '',
        'def read(data):',
        '    try:',
        '        return struct.unpack("<I", data)',
        '    except struct.error:',
        '        return None',
      ),
      [],
    ],
    [
      'a handler tuple kept in a constant',
      code(
        ...JSON,
        'PARSE_ERRORS = (ValueError,)',
        '',
        '',
        'def parse(text):',
        '    try:',
        '        return json.loads(text)',
        '    except PARSE_ERRORS:',
        '        return None',
      ),
      [],
    ],
    [
      'a call to another library with a json method name',
      code(
        'def parse(client):',
        '    try:',
        '        return client.json()',
        '    except KeyError:',
        '        return None',
      ),
      [],
    ],
  ]);

  itOutcomes('stays quiet in test files', [
    [
      'a test helper',
      {
        file: 'tests/test_parse.py',
        code: code(
          ...JSON,
          'def parse(text):',
          '    try:',
          '        return json.loads(text)',
          '    except JSONDecodeError:',
          '        return None',
        ),
      },
      [],
    ],
  ]);
});
