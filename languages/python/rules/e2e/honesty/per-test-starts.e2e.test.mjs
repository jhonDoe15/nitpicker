import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const RULE = 'server-or-container-per-test';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const startsOf = (files) => findingsOf(files).filter((line) => line.startsWith(`${RULE} `));

const POSTGRES = `import pytest
from testcontainers.postgres import PostgresContainer
`;
const TWO_TESTS = `

def test_reads(database):
    assert database


def test_writes(database):
    assert database
`;

describe.skipIf(!enabled)('containers, servers and processes started for each test', () => {
  it('reports a function-scoped fixture that starts a container for several tests', () => {
    const code = `${POSTGRES}

@pytest.fixture
def database():
    with PostgresContainer("postgres:16") as container:
        yield container
${TWO_TESTS}`;

    expect(startsOf({ 'tests/test_repository.py': code })).toEqual([
      `${RULE} tests/test_repository.py:7 testcontainers.postgres.PostgresContainer`,
    ]);
  });

  it('leaves a session, module or class scoped fixture and a fixture used once alone', () => {
    const scoped = (scope) => `${POSTGRES}

@pytest.fixture(scope="${scope}")
def database():
    with PostgresContainer("postgres:16") as container:
        yield container
${TWO_TESTS}`;
    const once = `${POSTGRES}

@pytest.fixture
def database():
    with PostgresContainer("postgres:16") as container:
        yield container


def test_reads(database):
    assert database
`;

    expect(
      startsOf({
        'tests/test_session.py': scoped('session'),
        'tests/test_module.py': scoped('module'),
        'tests/test_class.py': scoped('class'),
        'tests/test_once.py': once,
      }),
    ).toEqual([]);
  });

  it('counts conftest fixtures, autouse, usefixtures, parametrize and fixtures built on it', () => {
    const conftest = `import subprocess

import pytest
import uvicorn


@pytest.fixture
def server():
    process = subprocess.Popen(["uvicorn", "app:app"])
    yield process
    process.terminate()


@pytest.fixture
def client(server):
    return server


@pytest.fixture(scope="function")
def repository(tmp_path):
    subprocess.run(["git", "init", str(tmp_path)], check=True)
    return tmp_path


@pytest.fixture(autouse=True)
def app():
    uvicorn.run("app:app")
`;
    const tests = `import pytest


@pytest.mark.parametrize("path", ["/a", "/b"])
def test_paths(repository, path):
    assert repository


@pytest.mark.usefixtures("client")
def test_first():
    assert True


def test_second(client):
    assert client
`;

    expect(startsOf({ 'tests/conftest.py': conftest, 'tests/test_api.py': tests })).toEqual([
      `${RULE} tests/conftest.py:9 subprocess.Popen`,
      `${RULE} tests/conftest.py:21 subprocess.run`,
      `${RULE} tests/conftest.py:27 uvicorn.run`,
    ]);
  });

  it('reports a start in setup_method, setUp and setup_function', () => {
    const code = `import subprocess
import unittest
from http.server import HTTPServer


def setup_function():
    subprocess.Popen(["redis-server"])


class TestCache:
    def setup_method(self):
        self.server = HTTPServer(("localhost", 0), None)

    def test_a(self):
        assert self.server


class CacheTest(unittest.TestCase):
    def setUp(self):
        self.repo = subprocess.check_output(["git", "init"])

    def test_b(self):
        self.assertTrue(self.repo)
`;

    expect(startsOf({ 'tests/test_cache.py': code })).toEqual([
      `${RULE} tests/test_cache.py:7 subprocess.Popen`,
      `${RULE} tests/test_cache.py:12 http.server.HTTPServer`,
      `${RULE} tests/test_cache.py:20 subprocess.check_output`,
    ]);
  });

  it('reports the same start in two or more tests, not starts with other arguments', () => {
    const code = `import subprocess

from testcontainers.redis import RedisContainer


def test_first():
    with RedisContainer("redis:7") as redis:
        assert redis
    subprocess.run(["git", "init"], check=True)


def test_second():
    with RedisContainer("redis:7") as redis:
        assert redis
    subprocess.run(["git", "clone", "repo"], check=True)


def test_other_version():
    with RedisContainer("redis:6") as redis:
        assert redis
`;

    expect(startsOf({ 'tests/test_cache.py': code })).toEqual([
      `${RULE} tests/test_cache.py:7 testcontainers.redis.RedisContainer`,
      `${RULE} tests/test_cache.py:13 testcontainers.redis.RedisContainer`,
    ]);
  });

  it('ignores git commands that create nothing and production code', () => {
    const code = `import subprocess

import pytest


@pytest.fixture
def status():
    return subprocess.run(["git", "status"], check=True)


def test_a(status):
    assert status


def test_b(status):
    assert status
`;
    const production = `import subprocess


def setup_function():
    subprocess.Popen(["redis-server"])
`;

    expect(startsOf({ 'tests/test_git.py': code, 'src/app.py': production })).toEqual([]);
  });

  it('counts only the tests a fixture serves, past closer overrides', () => {
    const root = `import pytest
from testcontainers.postgres import PostgresContainer


@pytest.fixture
def database():
    with PostgresContainer("postgres:16") as container:
        yield container
`;
    const fake = `import pytest


@pytest.fixture
def database():
    return {}
`;
    const unit = `def test_reads(database):
    assert database == {}


def test_writes(database):
    assert database == {}
`;
    const integration = `def test_migrates(database):
    assert database
`;

    expect(
      startsOf({
        'conftest.py': root,
        'tests/unit/conftest.py': fake,
        'tests/unit/test_repository.py': unit,
        'tests/test_migrations.py': integration,
      }),
    ).toEqual([]);
  });

  it('reports pytestmark, fixture params and git options, not helpers and short commands', () => {
    const code = `import subprocess
import sys

import pytest
from testcontainers.core.waiting_utils import wait_for_logs

pytestmark = pytest.mark.usefixtures("repository")


@pytest.fixture
def repository(tmp_path):
    subprocess.run(["git", "-C", str(tmp_path), "init"], check=True)
    return tmp_path


@pytest.fixture(params=["a", "b"])
def server(request):
    return subprocess.Popen([sys.executable, "-m", "http.server", request.param])


@pytest.fixture
def ready(server):
    wait_for_logs(server, "ready")
    version = subprocess.Popen([sys.executable, "--version"])
    version.wait()
    return server


class Helper:
    def setUp(self):
        subprocess.Popen(["redis-server"])


def test_one(ready):
    assert ready


def test_two():
    assert subprocess.Popen([sys.executable, "-c", "pass"]).wait() == 0


def test_three():
    assert subprocess.Popen([sys.executable, "-c", "pass"]).wait() == 0
`;

    expect(startsOf({ 'tests/test_tools.py': code })).toEqual([
      `${RULE} tests/test_tools.py:12 subprocess.run`,
      `${RULE} tests/test_tools.py:18 subprocess.Popen`,
    ]);
  });
});
