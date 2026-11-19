def latest_release(versions):
    releases = [version for version in versions if version.stable]
    return max(releases, default=None)


def first_release(versions):
    releases = [version for version in versions if version.stable]
    if not releases:
        return None
    return releases[0]
