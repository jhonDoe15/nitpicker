import random


def test_draw():
    assert random.Random(42).random() < 1
