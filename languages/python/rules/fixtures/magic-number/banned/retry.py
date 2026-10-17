def retry(attempts):
    if attempts > 3:
        return False
    return attempts < 7.5
