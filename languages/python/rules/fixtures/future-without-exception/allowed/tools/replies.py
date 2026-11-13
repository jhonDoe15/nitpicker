import asyncio
from collections.abc import Callable

type Register = Callable[
    [Callable[[bytes], object], Callable[[BaseException], object]], None
]


def wait_reply(register: Register) -> asyncio.Future[bytes]:
    reply: asyncio.Future[bytes] = asyncio.get_running_loop().create_future()
    register(reply.set_result, reply.set_exception)
    return reply
