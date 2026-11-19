def _pipe(docs, proc, kwargs):
    return proc(docs, **kwargs)


def run(docs, pipeline, kwargs):
    for name, pipe in pipeline:
        docs = _pipe(pipe, docs, kwargs)
    return docs
