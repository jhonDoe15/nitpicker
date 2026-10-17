from typing import Any

from pydantic import BaseModel


class Payload(BaseModel):
    body: Any
