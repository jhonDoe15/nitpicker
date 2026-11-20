def load(client, bucket):
    response = client.list_objects_v2(Bucket=bucket)
    return [item["Key"] for item in response.get("Contents", [])]
