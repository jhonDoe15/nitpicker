from contextlib import contextmanager
from contextvars import ContextVar

handlers_var = ContextVar("handlers")


@contextmanager
def tracing(handler):
    token = handlers_var.set(handler)
    try:
        yield
    finally:
        handlers_var.reset(token)
