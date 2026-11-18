import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-unpaged-listing.mts';

const ruleTester = typescriptRuleTester();

function failing(messageId: 'listing' | 'search', codes: readonly string[]) {
  return codes.map((code) => ({ code, errors: [{ messageId }] }));
}

ruleTester.run('no-unpaged-listing', rule, {
  valid: cases([
    'for await (const page of paginateListObjectsV2({ client }, { Bucket })) { use(page); }',
    'async function all() { let token; do { const r = await ' +
      'client.send(new ListObjectsV2Command({ Bucket, ' +
      'ContinuationToken: token })); token = ' +
      'r.NextContinuationToken; } while (token); }',
    'async function any() { const r = await client.send(new ' +
      'ListObjectsV2Command({ Bucket, Prefix, MaxKeys: 1 })); return ' +
      'r.KeyCount > 0; }',
    'async function all() { let r = await s3.listObjectsV2({ ' +
      'Bucket }).promise(); while (r.IsTruncated) { r = await ' +
      's3.listObjectsV2({ Bucket, ContinuationToken: ' +
      'r.NextContinuationToken }).promise(); } }',
    'async function any() { return (await s3.listObjectsV2({ Bucket }).promise()).KeyCount > 0; }',
    'async function none() { const r = await s3.listObjectsV2({ ' +
      'Bucket }).promise(); return r.Contents?.length === 0; }',
    "const stream = minio.listObjectsV2('bucket', 'prefix', true);",
    'const command = new GetObjectCommand({ Bucket, Key });',
    "await client.ft.search('idx', '*', { LIMIT: { from: 0, size: 100 } });",
    "await client.ft.search('idx', '*', options);",
    "await client.search('idx', '*');",
    "await other.ft.query('idx', '*');",
  ]),
  invalid: [
    ...failing('listing', [
      'async function f() { const r = await client.send(new ' +
        'ListObjectsV2Command({ Bucket, Prefix })); return r.Contents; ' +
        '}',
      'async function f() { return client.send(new ListObjectsCommand({ Bucket })); }',
      'const r = await s3.listObjectsV2({ Bucket }).promise();',
      'async function f() { const r = await s3.listObjectsV2({ Bucket }).promise(); return r.Contents; }',
      'async function f() { const input = { Bucket }; return client.send(new ListObjectsV2Command(input)); }',
    ]),
    ...failing('search', [
      "await client.ft.search('idx', '*');",
      "await client.ft.search('idx', '@a:b', { RETURN: ['a'] });",
    ]),
  ],
});
