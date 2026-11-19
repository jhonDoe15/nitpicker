def latest_release(versions):
    releases = [version for version in versions if version.stable]
    return max(releases)
