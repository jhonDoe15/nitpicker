from shop.orders import decode_order, encode_order


def test_round_trip():
    order = {"a\né": 1}
    assert decode_order(encode_order(order)) == order
