import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts({
  hidden: ['test-without-assertion', 'repeated-string-literal', 'unused-argument'],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const found = (files) =>
  findingsOf(files)
    .filter((line) => line.startsWith('route-without-auth'))
    .map((line) => line.replace('route-without-auth ', ''));
const NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const lines = (make) => NAMES.flatMap((name) => ['', '', ...make(name)]);

const FASTAPI = ['from typing import Annotated', 'from fastapi import APIRouter, Depends, FastAPI'];
const fastapi = (...head) => ({
  protected: lines((n) => [
    `@router.get("/${n}")`,
    `def ${n}(user=Depends(get_current_user)):`,
    '    return 1',
  ]),
  head: [...FASTAPI, '', ...head],
});
const flask = [
  'from flask import Flask',
  'from flask_login import login_required',
  '',
  'app = Flask(__name__)',
];
const drf = [
  'from rest_framework.views import APIView',
  'from rest_framework.decorators import api_view',
];

describe.skipIf(!enabled)('route-without-auth', () => {
  it('reports FastAPI handlers without the dependency most handlers use', () => {
    const { protected: guarded, head } = fastapi('router = APIRouter()');
    const extra = ['', '', '@router.get("/reports")', 'def reports():', '    return 1'];

    expect(found({ 'mod.py': code(...head, ...guarded, ...extra) })).toEqual([
      'mod.py:53 reports|FastAPI|Depends(get_current_user)|9 of 10',
    ]);
  });

  it('counts Annotated aliases, route dependencies and router dependencies as the requirement', () => {
    const { head } = fastapi(
      'router = APIRouter()',
      'Current = Annotated[object, Depends(get_current_user)]',
    );
    const routes = lines((n) => [
      `@router.get("/${n}")`,
      `def ${n}(user=Depends(get_current_user)):`,
      '    return 1',
    ]);
    const extra = [
      '',
      '',
      '@router.get("/x")',
      'def x(user: Current):',
      '    return 1',
      '',
      '',
      '@router.get("/y", dependencies=[Depends(get_current_user)])',
      'def y():',
      '    return 1',
      '',
      '',
      '@router.get("/z")',
      'def z(user: Annotated[object, Depends(get_current_user)]):',
      '    return 1',
    ];

    expect(found({ 'mod.py': code(...head, ...routes, ...extra) })).toEqual([]);
  });

  it('leaves router and app dependencies, public routes and a missing majority alone', () => {
    const open = ['', '', '@router.get("/reports")', 'def reports():', '    return 1'];
    const routes = (router) =>
      lines((n) => [
        `@${router}.get("/${n}")`,
        `def ${n}(user=Depends(get_current_user)):`,
        '    return 1',
      ]);

    expect(
      found({
        'mod.py': code(
          ...FASTAPI,
          '',
          'router = APIRouter(dependencies=[Depends(get_current_user)])',
          'other = APIRouter()',
          ...routes('other'),
          ...open,
        ),
      }),
    ).toEqual([]);
    expect(
      found({
        'mod.py': code(
          ...FASTAPI,
          '',
          'app = FastAPI(dependencies=[Depends(get_current_user)])',
          'router = APIRouter()',
          ...routes('router'),
          ...open,
        ),
      }),
    ).toEqual([]);
    expect(
      found({
        'mod.py': code(
          ...FASTAPI,
          '',
          'router = APIRouter()',
          ...routes('router'),
          '',
          '',
          '@router.get("/health")',
          'def health():',
          '    return 1',
          '',
          '',
          '@router.post("/auth/login")',
          'def enter():',
          '    return 1',
          '',
          '',
          '@router.get("/docs-page", include_in_schema=False)',
          'def hidden():',
          '    return 1',
        ),
      }),
    ).toEqual([]);
    expect(
      found({
        'mod.py': code(
          ...FASTAPI,
          '',
          'router = APIRouter()',
          ...routes('router').slice(0, 21),
          ...open,
          '',
          '',
          '@router.get("/other")',
          'def other():',
          '    return 1',
        ),
      }),
    ).toEqual([]);
  });

  it('reports Django REST framework views without permission_classes', () => {
    const views = NAMES.flatMap((n) => [
      '',
      '',
      `class View${n}(APIView):`,
      '    permission_classes = [IsAuthenticated]',
    ]);
    const head = [...drf, 'from rest_framework.permissions import AllowAny, IsAuthenticated'];

    expect(
      found({
        'mod.py': code(...head, ...views, '', '', 'class Reports(APIView):', '    pass'),
      }),
    ).toEqual([
      'mod.py:42 Reports|Django REST framework|permission_classes with IsAuthenticated|9 of 10',
    ]);
    expect(
      found({
        'mod.py': code(
          ...head,
          ...views,
          '',
          '',
          '@api_view(["GET"])',
          'def ping_reports(request):',
          '    return 1',
          '',
          '',
          'class Open(APIView):',
          '    permission_classes = [AllowAny]',
          '',
          '',
          'class Login(APIView):',
          '    pass',
        ),
      }),
    ).toEqual([]);
    expect(
      found({
        'mod.py': code(...head, ...views, '', '', 'class Child(Base):', '    pass'),
        'settings.py': code(
          'REST_FRAMEWORK = {}',
          'REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"] = ["rest_framework.permissions.IsAuthenticated"]',
        ),
      }),
    ).toEqual([]);
    expect(
      found({
        'mod.py': code(
          ...head,
          ...views,
          '',
          '',
          '@api_view(["GET"])',
          'async def leaky(request):',
          '    return 1',
        ),
      }),
    ).toEqual([
      'mod.py:43 leaky|Django REST framework|permission_classes with IsAuthenticated|9 of 10',
    ]);
    expect(
      found({
        'mod.py': code(...head, ...views, '', '', 'class Child(Base):', '    pass'),
        'settings.py': code(
          'REST_FRAMEWORK = {"DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"]}',
        ),
      }),
    ).toEqual([]);
  });

  it('reports Flask routes without the login decorator most routes use', () => {
    const routes = lines((n) => [
      `@app.route("/${n}")`,
      '@login_required',
      `def ${n}():`,
      '    return 1',
    ]);
    const extra = ['', '', '@app.route("/reports")', 'def reports():', '    return 1'];

    expect(found({ 'mod.py': code(...flask, ...routes, ...extra) })).toEqual([
      'mod.py:62 reports|Flask|@login_required|9 of 10',
    ]);
    expect(
      found({
        'mod.py': code(
          ...flask,
          '',
          '',
          '@app.before_request',
          'def check():',
          '    return login_required',
          ...routes,
          ...extra,
        ),
      }),
    ).toEqual([]);
  });
});
