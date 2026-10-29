from sample.greeter import shout


def test_shout_upper_cases_the_greeting() -> None:
    assert shout("grace") == "HELLO, GRACE!"
