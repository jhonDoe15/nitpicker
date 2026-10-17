def test_patch(mocker):
    mocker.patch("os.getcwd", lambda: "/")
    assert 1
