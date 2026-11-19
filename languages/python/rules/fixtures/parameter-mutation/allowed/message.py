def to_payload(message):
    blocks = []
    for block in message.content:
        blocks.append({key: value for key, value in block.items() if key != "index"})
    return blocks
