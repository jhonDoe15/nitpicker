import marshal
import pickle

import yaml


def load(data):
    pickle.loads(data)
    marshal.loads(data)
    return yaml.load(data)
