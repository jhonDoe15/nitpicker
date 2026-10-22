import pytest


@pytest.fixture()
def paren():
    return 1


@pytest.fixture(scope="function")
def scoped():
    return 1


@pytest.fixture
def cleaned(request):
    request.addfinalizer(print)
    return 1


@pytest.yield_fixture
def old():
    yield 1


@pytest.fixture
def no_teardown():
    yield 1


@pytest.fixture
def default_value(number=1):
    return number


@pytest.fixture
def unused_value():
    return 1


def test_unused(_unused_value):
    assert 1


@pytest.mark.asyncio
@pytest.fixture
async def asynchronous():
    return 1


@pytest.fixture("session")
def positional():
    return 1


@pytest.mark.usefixtures("paren")
@pytest.fixture
def dependent():
    return 1
