from concurrent.futures import Future, ThreadPoolExecutor

RESULT_SECONDS = 30


def render(path: str) -> bytes:
    return path.encode()


def render_all(paths: list[str]) -> list[bytes]:
    with ThreadPoolExecutor() as pool:
        job: Future[bytes] = pool.submit(render, paths[0])
        return [job.result(timeout=RESULT_SECONDS)]
