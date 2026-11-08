BATCH_SIZE = 500


def thumbnail_jobs(assets, queue):
    jobs = []
    for asset in assets.order_by("id").iterator(chunk_size=BATCH_SIZE):
        jobs.append({"asset_id": asset.id})
        if len(jobs) >= BATCH_SIZE:
            queue.add_all(jobs)
            jobs.clear()
    queue.add_all(jobs)


def total(session, statement):
    count = 0
    for _ in session.execute(statement).yield_per(1000):
        count += 1
    return count


def body(response):
    chunks = []
    for chunk in response.stream(1024):
        chunks.append(chunk)
    return b"".join(chunks)


def small(rows):
    out = []
    for row in rows:
        out.append(row.id)
    return out
