import json

import yaml


class EnvLoader(yaml.SafeLoader):
    pass


class StrictEnvLoader(EnvLoader):
    pass


def load(data: str) -> object:
    json.loads(data)
    yaml.load(data, Loader=EnvLoader)
    yaml.load(data, StrictEnvLoader)
    return yaml.safe_load(data)
