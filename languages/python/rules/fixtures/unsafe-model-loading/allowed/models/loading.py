import numpy as np
import torch
import yaml
from ruamel.yaml import YAML


def load_checkpoint(path: str) -> object:
    return torch.load(path, weights_only=True)


def load_config(text: str) -> object:
    return yaml.safe_load(text)


def load_documents(text: str) -> list[object]:
    return list(yaml.load_all(text, Loader=yaml.SafeLoader))


def load_features(path: str) -> object:
    return np.load(path)


def load_round_trip(text: str) -> object:
    return YAML(typ="safe").load(text)
