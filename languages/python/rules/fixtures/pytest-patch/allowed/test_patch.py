def test_patch(mocker):
    mocker.patch("os.getcwd", return_value="/")
    assert 1
