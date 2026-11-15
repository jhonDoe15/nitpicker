import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { cleanup, findingsOf, outcomes } = createScripts({
  hidden: ['regex-pattern', 'unmapped-exception', 'handler-entities', 'pydantic-boundary'],
});
afterEach(cleanup);

const FASTAPI = 'from fastapi import FastAPI, Query\n\napp = FastAPI()\n\n\n';
const FLASK = 'from flask import Flask, request\n\napp = Flask(__name__)\n\n\n';
const SEARCH = `${FASTAPI}@app.get("/owners")\ndef find(last_name: str | None = None):\n    return db.query(Owner).filter(Owner.last_name.ilike(f"{last_name}%")).all()\n`;

describe.skipIf(!enabled)('untrimmed-request-text', () => {
  it('flags request text that reaches a lookup', () => {
    const [actual, expected] = outcomes([
      ['a FastAPI query parameter in a LIKE', SEARCH, ['untrimmed-request-text:7 find(last_name)']],
      [
        'a query parameter in filter_by',
        `${FASTAPI}@app.get("/owners")\ndef find(city: str = Query(None)):\n    return db.query(Owner).filter_by(city=city).all()\n`,
        ['untrimmed-request-text:7 find(city)'],
      ],
      [
        'a repository finder',
        `${FASTAPI}@app.get("/owners")\nasync def find(name: str):\n    return await repository.find_by_name(name)\n`,
        ['untrimmed-request-text:7 find(name)'],
      ],
      [
        'a Flask form value in a comparison',
        `${FLASK}@app.route("/owners")\ndef find():\n    last_name = request.args.get("last_name", "")\n    return Owner.query.filter(Owner.last_name == last_name).all()\n`,
        ['untrimmed-request-text:8 find(last_name)'],
      ],
      [
        'a query value in an SQL argument',
        `${FASTAPI}@app.get("/owners")\ndef find(name: str):\n    return cursor.execute("select * from owner where name = %s", (name,))\n`,
        ['untrimmed-request-text:7 find(name)'],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('stays quiet for trimmed text, identifiers and values that reach no lookup', () => {
    const [actual, expected] = outcomes([
      [
        'a strip before the lookup',
        `${FASTAPI}@app.get("/owners")\ndef find(last_name: str):\n    last_name = last_name.strip()\n    return db.query(Owner).filter(Owner.last_name.ilike(last_name)).all()\n`,
        [],
      ],
      [
        'a strip in the call',
        `${FASTAPI}@app.get("/owners")\ndef find(last_name: str):\n    return db.query(Owner).filter_by(last_name=last_name.strip()).all()\n`,
        [],
      ],
      [
        'a Flask value stripped where it is read',
        `${FLASK}@app.route("/owners")\ndef find():\n    last_name = request.args.get("last_name", "").strip()\n    return Owner.query.filter(Owner.last_name == last_name).all()\n`,
        [],
      ],
      [
        'an identifier and a number',
        `${FASTAPI}@app.get("/owners")\ndef find(owner_id: str, limit: int):\n    return db.query(Owner).filter_by(id=owner_id).limit(limit).all()\n`,
        [],
      ],
      [
        'text that is only logged',
        `${FASTAPI}@app.get("/owners")\ndef find(last_name: str):\n    logger.info(last_name)\n    return []\n`,
        [],
      ],
      [
        'a path parameter',
        `${FASTAPI}@app.get("/owners/{name}")\ndef find(name: str):\n    return repository.find_by_name(name)\n`,
        [],
      ],
      [
        'a constrained string type',
        `from typing import Annotated\nfrom pydantic import StringConstraints\n${FASTAPI}@app.get("/owners")\ndef find(name: Annotated[str, StringConstraints(strip_whitespace=True)]):\n    return repository.find_by_name(name)\n`,
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('reads request values used directly and Django request.GET', () => {
    const [actual, expected] = outcomes([
      [
        'a Flask subscript in filter_by',
        `${FLASK}@app.route("/owners")\ndef find():\n    return Owner.query.filter_by(name=request.args["name"]).all()\n`,
        ["untrimmed-request-text:8 find(request.args['name'])"],
      ],
      [
        'a lowered Flask value',
        `${FLASK}@app.route("/owners")\ndef find():\n    return Owner.query.filter_by(name=request.args.get("name", "").lower()).all()\n`,
        ["untrimmed-request-text:8 find(request.args.get('name', '').lower())"],
      ],
      [
        'a Django GET value',
        'from django.http import HttpResponse\n\n\ndef find(request):\n    name = request.GET.get("name")\n    return Owner.objects.filter(name=name)\n',
        ['untrimmed-request-text:5 find(name)'],
      ],
      [
        'an in-memory filter with startswith',
        `${FASTAPI}@app.get("/owners")\ndef find(prefix: str):\n    return list(filter(lambda n: n.startswith(prefix), NAMES))\n`,
        [],
      ],
    ]);
    expect(actual).toEqual(expected);
  });

  it('follows a pydantic request model and its shared base', () => {
    const base =
      'from pydantic import BaseModel, ConfigDict\n\n\nclass Base(BaseModel):\n    model_config = ConfigDict(str_strip_whitespace=True)\n';
    const model = (parent: string, imports = ''): string =>
      `${imports}from pydantic import BaseModel\n\n\nclass Search(${parent}):\n    name: str\n`;
    const api = `${FASTAPI}@app.post("/owners")\ndef find(payload: Search):\n    return repository.find_by_name(payload.name)\n`;
    expect(
      findingsOf({
        'src/models.py': model('BaseModel'),
        'src/api.py': `from models import Search\n${api}`,
      }),
    ).toEqual(['untrimmed-request-text src/api.py:8 find(payload.name)']);
    expect(
      findingsOf({
        'src/base.py': base,
        'src/models.py': model('Base', 'from base import Base\n'),
        'src/api.py': `from models import Search\n${api}`,
      }),
    ).toEqual([]);
    expect(
      findingsOf({
        'src/base.py': base,
        'src/models.py': model('BaseModel'),
        'src/api.py': `from models import Search\n${api}`,
      }),
    ).toEqual(['untrimmed-request-text src/api.py:8 find(payload.name)']);
  });
});
