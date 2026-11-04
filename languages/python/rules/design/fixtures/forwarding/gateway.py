class Backend:
    def send(self, to, body):
        return to + body

    def ping(self):
        return None

    def push(self, item):
        return None


def util(first, second=1):
    return first + second


class Gateway:
    def __init__(self, backend: Backend):
        self.backend = backend

    def send(self, to, body):
        """A docstring before the forwarded call does not stop the forward."""
        return self.backend.send(to, body)

    def send_reordered(self, to, body):
        return self.backend.send(body, to)

    def send_literal(self, to):
        return self.backend.send(to, "hello")

    def send_keywords(self, to, body):
        return self.backend.send(body=body, to=to)

    def send_extra_logic(self, to, body):
        print(to)
        return self.backend.send(to, body)

    def send_changed_result(self, to, body):
        return len(self.backend.send(to, body))

    def send_discarded(self, to, body):
        self.backend.send(to, body)

    def push(self, item):
        self.backend.push(item)

    def ping(self):
        self.backend.ping()

    def helper(self, first, second=2):
        return util(first, second)

    def make(self, to):
        return Backend()

    def unresolved(self, to, body):
        return self.other.send(to, body)

    def variadic(self, *items):
        return util(*items)

    async def send_async(self, to, body):
        return await self.backend.send(to, body)

    def reassigned(self, to, body):
        to = to.strip()
        return self.backend.send(to, body)

    def forwards_self(self, body):
        return util(self, body)
