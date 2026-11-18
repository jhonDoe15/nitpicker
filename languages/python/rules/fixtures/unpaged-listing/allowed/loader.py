def load(client, bucket):
    keys = []
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        keys.extend(item["Key"] for item in page.get("Contents", []))
    return keys
