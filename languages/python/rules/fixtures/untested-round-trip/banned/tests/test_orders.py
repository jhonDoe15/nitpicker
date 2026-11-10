from shop.orders import decode_order, encode_order


def test_encode():
    assert encode_order({"a": 1}) == '{"a": 1}'


def test_decode():
    assert decode_order('{"a": 1}') == {"a": 1}
