import locale
import os
import time

from shop import settings


def test_region():
    os.environ["SHOP_REGION"] = "EU"
    assert os.environ["SHOP_REGION"] == "EU"


def test_zone():
    os.environ.update({"TZ": "Europe/Paris"})
    time.tzset()
    assert time.tzname


def test_locale():
    locale.setlocale(locale.LC_ALL, "C")
    assert locale.setlocale(locale.LC_ALL)


def test_debug():
    settings.DEBUG = True
    assert settings.DEBUG
