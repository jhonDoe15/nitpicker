import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('unpaged-listing', () => {
  itOutcomes('flags a listing read once', [
    [
      'a boto3 list_objects_v2 read once',
      'def load(client, bucket):\n    response = ' +
        'client.list_objects_v2(Bucket=bucket)\n    return ' +
        '[item["Key"] for item in response["Contents"]]\n',
      ['unpaged-listing:2 listing|client.list_objects_v2'],
    ],
    [
      'a list_objects with a prefix',
      'def load(client, bucket):\n    return client.list_objects(Bucket=bucket, Prefix="a/")\n',
      ['unpaged-listing:2 listing|client.list_objects'],
    ],
    [
      'a redis search without paging',
      'def clear(client, index, query):\n    return client.ft(index).search(query)\n',
      ['unpaged-listing:2 search|client.ft(index).search'],
    ],
  ]);

  itOutcomes('leaves paged and bounded listings alone', [
    [
      'a paginator',
      'def load(client, bucket):\n    for page in ' +
        'client.get_paginator("list_objects_v2").paginate(Bucket=bucket):\n ' +
        '       yield page\n',
      [],
    ],
    [
      'a continuation token loop',
      'def load(client, bucket):\n    token = None\n    while ' +
        'True:\n        extra = {"ContinuationToken": token} if token ' +
        'else {}\n        page = client.list_objects_v2(Bucket=bucket, ' +
        '**extra)\n        token = page.get("NextContinuationToken")\n ' +
        '       if not token:\n            return\n',
      [],
    ],
    [
      'an existence check',
      'def exists(client, bucket):\n    return client.list_objects_v2(Bucket=bucket, MaxKeys=1)\n',
      [],
    ],
    [
      'a count tested against zero',
      'def any_keys(client, bucket):\n    return client.list_objects_v2(Bucket=bucket)["KeyCount"] > 0\n',
      [],
    ],
    [
      'a response only tested for contents',
      'def empty(client, bucket):\n    response = ' +
        'client.list_objects_v2(Bucket=bucket)\n    return "Contents" ' +
        'not in response\n',
      [],
    ],
    [
      'a list_objects call without a bucket keyword',
      'def load(minio, bucket):\n    return list(minio.list_objects(bucket))\n',
      [],
    ],
    [
      'a redis search with paging',
      'def clear(client, index, query):\n    return client.ft(index).search(query.paging(0, 1000))\n',
      [],
    ],
  ]);
});
