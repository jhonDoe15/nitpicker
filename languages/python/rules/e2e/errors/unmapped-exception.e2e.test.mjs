import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes: allOutcomes } = createScripts();
afterEach(cleanup);

const RULE = 'unmapped-exception';
const APP = 'from fastapi import APIRouter, FastAPI, HTTPException\n\napp = FastAPI()\n';
const ERROR = '\n\nclass Missing(Exception):\n    pass\n';
const ROUTE = '\n\n@app.get("/items/{key}")\ndef read(key: int):\n';

function outcomes(rows) {
  const [actual, expected] = allOutcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [name, found.filter((f) => f.startsWith(RULE))]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('unmapped-exception', () => {
  it('reports a project exception that a route can raise and no handler maps', () => {
    const [actual, expected] = outcomes([
      [
        'raised in the route',
        `${APP}${ERROR}${ROUTE}    raise Missing()\n`,
        [`${RULE}:11 \`read\` can raise \`Missing\``],
      ],
      [
        'raised in a helper and a method',
        `${APP}${ERROR}\n\nclass Store:\n    def load(self, key):\n        raise Missing\n\n\ndef find(key):\n    return Store().load(key)\n${ROUTE}    return find(key)\n`,
        [
          `${RULE}:20 \`read\` can raise \`Missing\` via \`read\` can raise \`Missing\` (through \`find\`, \`Store.load\`)`,
        ],
      ],
      [
        'a router route and a project base class',
        `${APP}${ERROR}\n\nclass Gone(Missing):\n    pass\n\n\nrouter = APIRouter()\n\n\n@router.post("/items")\nasync def create():\n    raise Gone("old")\n`,
        [`${RULE}:18 \`create\` can raise \`Gone\``],
      ],
      [
        'a catch-all handler that checks another class',
        `${APP}${ERROR}\n\nclass Other(Exception):\n    pass\n\n\n@app.exception_handler(Exception)\nasync def fallback(request, error):\n    if isinstance(error, Other):\n        return None\n    raise error\n${ROUTE}    raise Missing()\n`,
        [`${RULE}:22 \`read\` can raise \`Missing\``],
      ],
      [
        'a route on an app built in a factory',
        `from fastapi import FastAPI\n${ERROR}\n\ndef create():\n    app = FastAPI()\n\n    @app.get("/")\n    def read():\n        raise Missing()\n\n    return app\n`,
        [`${RULE}:12 \`read\` can raise \`Missing\``],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('passes exceptions that a handler or a status class maps, and raises it cannot follow', () => {
    const [actual, expected] = outcomes([
      [
        'a decorated handler on the base class',
        `${APP}${ERROR}\n\nclass Gone(Missing):\n    pass\n\n\n@app.exception_handler(Missing)\nasync def missing(request, error):\n    return None\n${ROUTE}    raise Gone()\n`,
        [],
      ],
      [
        'add_exception_handler and the exception_handlers argument',
        `from fastapi import FastAPI\n${ERROR}\n\nclass Other(Exception):\n    pass\n\n\ndef handle(request, error):\n    return None\n\n\napp = FastAPI(exception_handlers={Other: handle})\napp.add_exception_handler(Missing, handle)\n\n\n@app.get("/")\ndef read(flag: bool):\n    if flag:\n        raise Other()\n    raise Missing()\n`,
        [],
      ],
      [
        'a catch-all handler that checks the class',
        `${APP}${ERROR}\n\n@app.exception_handler(Exception)\nasync def fallback(request, error):\n    if isinstance(error, Missing):\n        return None\n    raise error\n${ROUTE}    raise Missing()\n`,
        [],
      ],
      [
        'an HTTPException subclass, a caught raise, a builtin and a plain function',
        `${APP}\n\nclass NotFound(HTTPException):\n    pass\n${ERROR}${ROUTE}    try:\n        raise Missing()\n    except Missing:\n        pass\n    if key < 0:\n        raise ValueError(key)\n    raise NotFound(status_code=404)\n\n\ndef helper():\n    raise Missing()\n`,
        [],
      ],
      [
        'handlers from a variable, a loop and an isinstance tuple',
        `from fastapi import FastAPI\n${ERROR}\n\nclass Other(Exception):\n    pass\n\n\nclass Third(Exception):\n    pass\n\n\nclass Fourth(Exception):\n    pass\n\n\ndef handle(request, error):\n    if isinstance(error, (Third, Fourth)):\n        return None\n    raise error\n\n\nHANDLERS = {Missing: handle}\napp = FastAPI(exception_handlers=HANDLERS)\nfor kind in (Other,):\n    app.add_exception_handler(kind, handle)\napp.add_exception_handler(Exception, handle)\n\n\n@app.get("/")\ndef read(flag: int):\n    if flag == 1:\n        raise Missing()\n    if flag == 2:\n        raise Third()\n    raise Other()\n`,
        [],
      ],
      [
        'a library base, a FastAPI websocket error and contextlib.suppress',
        `import contextlib\n\nfrom fastapi import FastAPI\nfrom fastapi.exceptions import WebSocketException\nfrom somelib.errors import ApiError\n\napp = FastAPI()\n\n\nclass Remote(ApiError):\n    pass\n\n\nclass Closed(WebSocketException):\n    pass\n${ERROR}\n\ndef fail():\n    raise Missing()\n\n\n@app.get("/")\ndef read(flag: bool):\n    with contextlib.suppress(Missing):\n        fail()\n    if flag:\n        raise Closed(1008)\n    raise Remote()\n`,
        [],
      ],
      [
        'a handler registered in another module',
        {
          files: {
            'errors.py': 'class Missing(Exception):\n    pass\n',
            'main.py':
              'from fastapi import FastAPI\n\nfrom errors import Missing\n\napp = FastAPI()\n\n\n@app.exception_handler(Missing)\nasync def missing(request, error):\n    return None\n',
            'routes.py':
              'from errors import Missing\nfrom main import app\n\n\n@app.get("/")\ndef read():\n    raise Missing()\n',
          },
        },
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });
});
