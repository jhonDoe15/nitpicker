from pydantic import BaseModel, Field


class Payload(BaseModel):
    body: str = Field(min_length=1)
