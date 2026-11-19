import {
  useRuleScripts,
  pythonLines as code,
  ruleLine,
} from '../../test-support/python-rule-scripts.mts';

const RULE = 'reset-skipped-on-failure';
const found = ruleLine(RULE);
const { itOutcomes, describeRules } = useRuleScripts(RULE, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const HEAD = [
  'import contextlib',
  'from contextlib import contextmanager',
  'import contextvars',
  '',
];
const VARIABLE = [...HEAD, 'handlers_var = contextvars.ContextVar("handlers")', '', ''];

describeRules(RULE, () => {
  itOutcomes('reports a context manager whose undo step follows a bare yield', [
    [
      'a context variable reset after the yield',
      code(
        ...VARIABLE,
        '@contextmanager',
        'def tracing(handler):',
        '    token = handlers_var.set(handler)',
        '    yield',
        '    handlers_var.reset(token)',
      ),
      [found(12, 'tracing: handlers_var.set() before handlers_var.reset()')],
    ],
    [
      'an asynchronous context manager',
      code(
        ...VARIABLE,
        '@contextlib.asynccontextmanager',
        'async def tracing(handler):',
        '    token = handlers_var.set(handler)',
        '    yield handler',
        '    handlers_var.reset(token)',
      ),
      [found(12, 'tracing: handlers_var.set() before handlers_var.reset()')],
    ],
    [
      'a yield inside a with block that does not cover the reset',
      code(
        ...VARIABLE,
        '@contextmanager',
        'def tracing(handler, lock):',
        '    token = handlers_var.set(handler)',
        '    with lock:',
        '        yield',
        '        handlers_var.reset(token)',
      ),
      [found(13, 'tracing: handlers_var.set() before handlers_var.reset()')],
    ],
    [
      'a saved attribute restored afterwards',
      code(
        ...HEAD,
        '@contextmanager',
        'def patched(target, value):',
        '    saved = target.mode',
        '    target.mode = value',
        '    yield',
        '    target.mode = saved',
      ),
      [found(10, 'patched: target.mode set before and again after')],
    ],
    [
      'a module global set and cleared',
      code(
        ...HEAD,
        'ACTIVE = None',
        '',
        '',
        '@contextmanager',
        'def active(name):',
        '    global ACTIVE',
        '    ACTIVE = name',
        '    yield',
        '    ACTIVE = None',
      ),
      [found(13, 'active: ACTIVE set before and again after')],
    ],
    [
      'a handler added and removed',
      code(
        ...HEAD,
        '@contextmanager',
        'def listening(logger, handler):',
        '    logger.addHandler(handler)',
        '    yield',
        '    logger.removeHandler(handler)',
      ),
      [found(9, 'listening: logger.addHandler() before logger.removeHandler()')],
    ],
    [
      'a registration removed',
      code(
        ...HEAD,
        '@contextmanager',
        'def registered(registry, hook):',
        '    registry.register(hook)',
        '    yield',
        '    registry.unregister(hook)',
      ),
      [found(9, 'registered: registry.register() before registry.unregister()')],
    ],
    [
      'a resource opened and closed after the yield',
      code(
        ...HEAD,
        '@contextmanager',
        'def session(factory):',
        '    handle = factory()',
        '    yield handle',
        '    handle.close()',
      ),
      [found(9, 'session: factory() before handle.close()')],
    ],
  ]);

  itOutcomes('reports a set, call and reset sequence in a plain function', [
    [
      'a context variable reset after a call',
      code(
        ...VARIABLE,
        'def run(handler, task):',
        '    token = handlers_var.set(handler)',
        '    result = task()',
        '    handlers_var.reset(token)',
        '    return result',
      ),
      [found(11, 'run: handlers_var.set() before handlers_var.reset()')],
    ],
    [
      'an option put back after the call',
      code(
        'class Sender:',
        '    def send(self, message, call):',
        '        saved = self.options',
        '        self.options = None',
        '        call(message)',
        '        self.options = saved',
      ),
      [found(6, 'send: self.options set before and again after')],
    ],
    [
      'a module handler added and removed around a call',
      code(
        'import logging',
        '',
        'logger = logging.getLogger("app")',
        '',
        '',
        'def watch(handler, task):',
        '    logger.addHandler(handler)',
        '    task()',
        '    logger.removeHandler(handler)',
      ),
      [found(9, 'watch: logger.addHandler() before logger.removeHandler()')],
    ],
  ]);

  itOutcomes('stays quiet when the undo step is protected or nothing can leak', [
    [
      'a lifespan function of an application',
      code(
        ...HEAD,
        '@contextlib.asynccontextmanager',
        'async def lifespan(app):',
        '    app.state.db = await create_pool()',
        '    yield',
        '    app.state.db = None',
      ),
      [],
    ],
    [
      'a context manager passed as lifespan',
      code(
        ...HEAD,
        '@contextlib.asynccontextmanager',
        'async def run(app):',
        '    pool = await create_pool()',
        '    yield',
        '    await pool.close()',
        '',
        '',
        'application = FastAPI(lifespan=run)',
      ),
      [],
    ],
    [
      'a resource opened and closed in a plain function',
      code(
        'def read(path):',
        '    handle = open(path)',
        '    data = handle.read()',
        '    handle.close()',
        '    return data',
      ),
      [],
    ],
    [
      'backtracking state held in locals',
      code(
        'def walk(node, graph):',
        '    visiting = set()',
        '    path = []',
        '    visiting.add(node)',
        '    path.append(node)',
        '    graph.visit(node)',
        '    visiting.discard(node)',
        '    path.remove(node)',
      ),
      [],
    ],
    [
      'backtracking state held in a parameter',
      code(
        'def walk(node, visiting, graph):',
        '    visiting.add(node)',
        '    graph.visit(node)',
        '    visiting.discard(node)',
      ),
      [],
    ],
    [
      'a yield inside try and finally',
      code(
        ...VARIABLE,
        '@contextmanager',
        'def tracing(handler):',
        '    token = handlers_var.set(handler)',
        '    try:',
        '        yield',
        '    finally:',
        '        handlers_var.reset(token)',
      ),
      [],
    ],
    [
      'a broad handler that undoes and raises again',
      code(
        ...VARIABLE,
        '@contextmanager',
        'def tracing(handler):',
        '    token = handlers_var.set(handler)',
        '    try:',
        '        yield',
        '    except BaseException:',
        '        handlers_var.reset(token)',
        '        raise',
        '    handlers_var.reset(token)',
      ),
      [],
    ],
    [
      'an exit stack callback',
      code(
        ...VARIABLE,
        '@contextmanager',
        'def tracing(handler):',
        '    with contextlib.ExitStack() as stack:',
        '        token = handlers_var.set(handler)',
        '        stack.callback(handlers_var.reset, token)',
        '        yield',
      ),
      [],
    ],
    [
      'a class based context manager',
      code(
        ...VARIABLE,
        'class Tracing:',
        '    def __init__(self, handler):',
        '        self.handler = handler',
        '',
        '    def __enter__(self):',
        '        self.token = handlers_var.set(self.handler)',
        '',
        '    def __exit__(self, *exc):',
        '        handlers_var.reset(self.token)',
      ),
      [],
    ],
    [
      'a context manager that only yields a value',
      code(
        ...HEAD,
        '@contextmanager',
        'def number():',
        '    value = 1',
        '    yield value',
        '    value = 2',
      ),
      [],
    ],
    [
      'a plain function that resets in finally',
      code(
        ...VARIABLE,
        'def run(handler, task):',
        '    token = handlers_var.set(handler)',
        '    try:',
        '        return task()',
        '    finally:',
        '        handlers_var.reset(token)',
      ),
      [],
    ],
    [
      'a plain function with no call between the steps',
      code(
        ...VARIABLE,
        'def run(handler):',
        '    token = handlers_var.set(handler)',
        '    handlers_var.reset(token)',
      ),
      [],
    ],
    [
      'a state field that moves forward after a call',
      code(
        'def run(job):',
        '    job.state = "running"',
        '    job.execute()',
        '    job.state = "done"',
      ),
      [],
    ],
    [
      'a pytest fixture',
      code(
        'import pytest',
        '',
        '',
        '@pytest.fixture',
        'def tracing(var):',
        '    token = var.set(1)',
        '    yield',
        '    var.reset(token)',
      ),
      [],
    ],
  ]);

  itOutcomes('stays quiet in test files', [
    [
      'a test helper',
      {
        file: 'tests/test_tracing.py',
        code: code(
          ...VARIABLE,
          '@contextmanager',
          'def tracing(handler):',
          '    token = handlers_var.set(handler)',
          '    yield',
          '    handlers_var.reset(token)',
        ),
      },
      [],
    ],
  ]);
});
