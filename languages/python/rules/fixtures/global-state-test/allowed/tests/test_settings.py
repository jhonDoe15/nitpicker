import os
from unittest import mock

import pytest

from shop import settings


@pytest.fixture
def region():
    previous = os.environ.get("SHOP_REGION")
    os.environ["SHOP_REGION"] = "EU"
    yield "EU"
    if previous is None:
        os.environ.pop("SHOP_REGION")
    else:
        os.environ["SHOP_REGION"] = previous


def test_region(region):
    assert os.environ["SHOP_REGION"] == region


def test_patched():
    with mock.patch.dict(os.environ, {"SHOP_REGION": "US"}):
        os.environ["SHOP_CHANNEL"] = "web"
        assert os.environ["SHOP_CHANNEL"] == "web"


def test_monkeypatch(monkeypatch):
    monkeypatch.setenv("SHOP_REGION", "EU")
    monkeypatch.setattr(settings, "DEBUG", True)
    assert settings.DEBUG


def test_finally():
    previous = settings.TIMEOUT
    settings.TIMEOUT = 1
    try:
        assert settings.TIMEOUT == 1
    finally:
        settings.TIMEOUT = previous


class TestDebug:
    def setup_method(self):
        settings.DEBUG = True

    def teardown_method(self):
        settings.DEBUG = False

    def test_debug(self):
        assert settings.DEBUG
