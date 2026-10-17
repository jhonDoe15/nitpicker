import pytest


@pytest.fixture
def simple():
    return 1


@pytest.fixture(scope="session")
def shared():
    return 1


@pytest.fixture
def with_teardown(tmp_path):
    handle = (tmp_path / "x").open("w")
    yield handle
    handle.close()


@pytest.fixture
def action():
    return 1


@pytest.mark.usefixtures("action")
def test_action(simple):
    assert simple == 1


@pytest.fixture
async def asynchronous():
    return 1
