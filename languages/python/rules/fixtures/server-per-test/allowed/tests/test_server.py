import subprocess

import pytest


@pytest.fixture(scope="session")
def server():
    process = subprocess.Popen(["python", "-m", "http.server", "0"])
    yield process
    process.terminate()


def test_serves(server):
    assert server.pid


def test_serves_again(server):
    assert server.pid
