import time


def total(root):
    result = 0
    pending = [root]
    for node in pending:
        result += node.value
        pending.extend(node.children)
    return result


def fetch(client, attempts):
    for attempt in range(attempts):
        try:
            return client.get()
        except ConnectionError:
            time.sleep(attempt)
    raise ConnectionError("no response")


def names(users):
    return [user.name for user in users]


class Tree:
    def depth(self, root):
        deepest = 0
        pending = [(root, 1)]
        for node, level in pending:
            deepest = max(deepest, level)
            pending.extend((child, level + 1) for child in node.children)
        return deepest

    def render(self, node):
        return node.render()

    def child(self, node):
        return node.child()


def walk(node):
    return node.walk()


from util import dumps


class Codec:
    def dumps(self, value):
        return dumps(value)
