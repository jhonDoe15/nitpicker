def to_payload(message):
    blocks = []
    for block in message.content:
        block.pop("index")
        blocks.append(block)
    return blocks
