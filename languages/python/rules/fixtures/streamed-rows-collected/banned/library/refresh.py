def thumbnail_jobs(assets):
    jobs = []
    for asset in assets.order_by("id").iterator(chunk_size=500):
        jobs.append({"asset_id": asset.id})
    return jobs


async def library_paths(session, statement):
    paths = []
    async for row in await session.stream(statement):
        paths.append(row.path)
    return paths


def all_ids(session, statement):
    return [row.id for row in session.execute(statement).yield_per(1000)]


def named(connection):
    with connection.cursor(name="assets") as cursor:
        cursor.execute("select id from assets")
        return list(cursor)


def typed_jobs(session, statement):
    jobs: list[int] = []
    for row in session.execute(statement.execution_options(stream_results=True)):
        jobs.append(row.id)
    return jobs
