import { expect, it } from 'vitest';
import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { findingsOf, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const RULE = 'managed-resource-outside-composition-root';
const lines = (...rows: string[]) => `${rows.join('\n')}\n`;

const resources = (code: string, file = 'shop/orders.py') =>
  findingsOf({
    'shop/__init__.py': '',
    'shop/api/__init__.py': '',
    [file]: code,
  }).filter((finding) => finding.startsWith(`${RULE} `));

describeRules(RULE, () => {
  it.each([
    [
      'create_engine',
      'from sqlalchemy import create_engine',
      'create_engine("sqlite://")',
      'sqlalchemy.create_engine',
    ],
    [
      'create_async_engine',
      'from sqlalchemy.ext.asyncio import create_async_engine',
      'create_async_engine("sqlite+aiosqlite://")',
      'sqlalchemy.ext.asyncio.create_async_engine',
    ],
    [
      'asyncpg.create_pool',
      'import asyncpg',
      'asyncpg.create_pool("postgres://")',
      'asyncpg.create_pool',
    ],
    ['redis.Redis', 'import redis', 'redis.Redis()', 'redis.Redis'],
    [
      'Redis.from_url',
      'from redis import Redis',
      'Redis.from_url("redis://")',
      'redis.Redis.from_url',
    ],
    ['httpx.Client', 'import httpx', 'httpx.Client()', 'httpx.Client'],
    ['httpx.AsyncClient', 'import httpx', 'httpx.AsyncClient()', 'httpx.AsyncClient'],
    ['requests.Session', 'import requests', 'requests.Session()', 'requests.Session'],
    ['aiohttp.ClientSession', 'import aiohttp', 'aiohttp.ClientSession()', 'aiohttp.ClientSession'],
    ['boto3.client', 'import boto3', 'boto3.client("s3")', 'boto3.client'],
    ['Celery', 'from celery import Celery', 'Celery("shop")', 'celery.Celery'],
  ])('reports %s outside the composition root', (_name, header, call, subject) => {
    const code = lines(header, '', 'def make():', `    return ${call}`);

    expect(resources(code)).toEqual([`${RULE} shop/orders.py:4 ${subject}`]);
  });

  it('allows the composition root files of the root package', () => {
    const code = lines('import httpx', '', 'client = httpx.Client()');

    expect(resources(code, 'shop/main.py')).toEqual([]);
    expect(resources(code, 'shop/server.py')).toEqual([]);
    expect(resources(code, 'shop/composition_root.py')).toEqual([]);
    expect(resources(code, 'shop/composition_root/clients.py')).toEqual([]);
  });

  it('allows other files the program starts from and reports a feature module', () => {
    const code = lines('import httpx', '', 'client = httpx.Client()');

    expect(resources(code, 'shop/api/main.py')).toEqual([]);
    expect(resources(code, 'shop/api/views.py')).toEqual([
      `${RULE} shop/api/views.py:3 httpx.Client`,
    ]);
  });

  it('allows a client scoped by a with statement', () => {
    const code = lines(
      'import httpx',
      '',
      'async def run(url):',
      '    with httpx.Client() as client:',
      '        client.get(url)',
      '    async with httpx.AsyncClient() as other:',
      '        await other.get(url)',
    );

    expect(resources(code)).toEqual([]);
  });

  it('allows a client passed in, library calls and tests', () => {
    const code = lines(
      'import httpx',
      '',
      'def fetch(client: httpx.Client):',
      '    return client.get("https://example.com")',
      '',
      'def read():',
      '    return httpx.get("https://example.com")',
    );

    expect(resources(code)).toEqual([]);
    expect(
      resources(lines('import httpx', '', 'client = httpx.Client()'), 'tests/test_orders.py'),
    ).toEqual([]);
  });
});
