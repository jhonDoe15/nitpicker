import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: [
    'test-without-assertion',
    'module-level-mutable-state',
    'null-valued-input-key',
    'swallowed-exception',
  ],
});

describe.skipIf(!enabled)('missing-key-subscript', () => {
  itOutcomes('flags a subscript of a mapping the code does not control', [
    [
      'a session key',
      code('def plan(request):', '    return request.session[SESSION_KEY_PLAN]'),
      ['missing-key-subscript:2 request|request.session[SESSION_KEY_PLAN]'],
    ],
    [
      'a cookie, a header and a query parameter',
      code(
        'def read(request):',
        '    a = request.COOKIES["sid"]',
        '    b = request.headers["X-Token"]',
        '    c = request.GET["page"]',
        '    return a, b, c',
      ),
      [
        "missing-key-subscript:2 request|request.COOKIES['sid']",
        "missing-key-subscript:3 request|request.headers['X-Token']",
        "missing-key-subscript:4 request|request.GET['page']",
      ],
    ],
    [
      'a Starlette cookie from the scope',
      code(
        'class Consumer:',
        '    def device(self):',
        '        return self.scope["cookies"]["device"]',
      ),
      ["missing-key-subscript:3 request|self.scope['cookies']['device']"],
    ],
    [
      'a request attribute of a view',
      code('class View:', '    def get(self):', '        return self.request.session["plan"]'),
      ["missing-key-subscript:3 request|self.request.session['plan']"],
    ],
    [
      'the header of an untrusted token',
      code(
        'import jwt',
        '',
        '',
        'def key_id(token):',
        '    header = jwt.get_unverified_header(token)',
        '    return header["kid"]',
      ),
      ["missing-key-subscript:6 token|header['kid']"],
    ],
    [
      'a remote document',
      code(
        'import requests',
        '',
        '',
        'def endpoint(url):',
        '    config = requests.get(url).json()',
        '    return config["token_endpoint"]',
      ),
      ["missing-key-subscript:6 remote|config['token_endpoint']"],
    ],
    [
      'a subscript of a response that is not a configuration document',
      code(
        'import requests',
        '',
        '',
        'def token(url):',
        '    response = requests.post(url)',
        '    return response.json()["access_token"]',
      ),
      [],
    ],
    [
      'a coordinator data entry in an entity property',
      code(
        'class Sensor:',
        '    @property',
        '    def temperature(self):',
        '        return self.coordinator.data[self._device_id].temperature',
      ),
      ['missing-key-subscript:4 coordinator|self.coordinator.data[self._device_id]'],
    ],
    [
      'an async request body',
      code(
        'async def view(request):',
        '    body = await request.json()',
        '    return body["name"]',
      ),
      ["missing-key-subscript:3 request|body['name']"],
    ],
  ]);

  itOutcomes('stays quiet when the missing case is handled', [
    [
      'a get with the missing case handled',
      code(
        'def plan(request):',
        '    plan = request.session.get(KEY)',
        '    if plan is None:',
        '        return None',
        '    return plan',
      ),
      [],
    ],
    [
      'a membership guard in the same function',
      code(
        'def plan(request):',
        '    if KEY not in request.session:',
        '        return None',
        '    return request.session[KEY]',
      ),
      [],
    ],
    [
      'a try that catches KeyError',
      code(
        'def plan(request):',
        '    try:',
        '        return request.session[KEY]',
        '    except KeyError:',
        '        return None',
      ),
      [],
    ],
    [
      'a try that catches a different error',
      code(
        'def plan(request):',
        '    try:',
        '        return request.session[KEY]',
        '    except ValueError:',
        '        return None',
      ),
      ['missing-key-subscript:3 request|request.session[KEY]'],
    ],
    [
      'a Django try that catches MultiValueDictKeyError',
      code(
        'from django.utils.datastructures import MultiValueDictKeyError',
        '',
        '',
        'def page(request):',
        '    try:',
        '        return request.GET["page"]',
        '    except MultiValueDictKeyError:',
        '        return 1',
      ),
      [],
    ],
    [
      'a suppress of KeyError',
      code(
        'import contextlib',
        '',
        '',
        'def sid(request):',
        '    with contextlib.suppress(KeyError):',
        '        return request.COOKIES["sid"]',
      ),
      [],
    ],
    [
      'a session key set with setdefault or update first',
      code(
        'def cart(request):',
        '    request.session.setdefault("cart", {})',
        '    request.session.update(a=1)',
        '    return request.session["cart"]',
      ),
      [],
    ],
    [
      'a write and a delete',
      code(
        'def store(request):',
        '    request.session[KEY] = 1',
        '    del request.session["other"]',
      ),
      [],
    ],
    [
      'a read after the same function wrote the key',
      code(
        'def store(request):',
        '    request.session[KEY] = 1',
        '    return request.session[KEY]',
      ),
      [],
    ],
    [
      'a coordinator entry that is checked first',
      code(
        'class Sensor:',
        '    @property',
        '    def temperature(self):',
        '        if self._device_id not in self.coordinator.data:',
        '            return None',
        '        return self.coordinator.data[self._device_id].temperature',
      ),
      [],
    ],
    [
      'a dict the code builds itself',
      code('def read():', '    session = {"a": 1}', '    return session["a"]'),
      [],
    ],
    [
      'a mapping of an unrelated request-like name',
      code('def read(job):', '    return job.session["a"]'),
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_view.py',
        code: code('def test_plan(request):', '    assert request.session["a"] == 1'),
      },
      [],
    ],
  ]);
});
