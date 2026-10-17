import numpy as np
import torch
import yaml
from ruamel.yaml import YAML


def load_checkpoint(path):
    return torch.load(path)


def load_config(text):
    return yaml.full_load(text)


def load_documents(text):
    return list(yaml.load_all(text, Loader=yaml.FullLoader))


def load_features(path):
    return np.load(path, allow_pickle=True)


def load_round_trip(text):
    return YAML(typ="unsafe").load(text)
