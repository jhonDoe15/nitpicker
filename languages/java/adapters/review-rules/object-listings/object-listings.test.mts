import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../max-value-sums/source-file.mjs';
import { findUnpagedListings as untypedFind } from './object-listings.mjs';

const parse: (text: string, options: { file: string; kotlin: boolean }) => unknown = untypedParse;
const find: (source: unknown) => { readonly kind: string }[] = untypedFind;

function java(imports: string, body: string) {
  const text = `${imports}\nclass Loader {\n  void load() {\n${body}\n  }\n}\n`;
  return find(parse(text, { file: 'Loader.java', kotlin: false })).map(({ kind }) => kind);
}

const AWS = 'import software.amazon.awssdk.services.s3.S3Client;';
const JEDIS = 'import redis.clients.jedis.UnifiedJedis;';

describe('UnpagedListing', () => {
  it('reports a listing read once, as in the S3 loader fixes', () => {
    expect(
      java(
        AWS,
        'ListObjectsV2Response response = s3Client.listObjectsV2(request);\nresponse.contents().forEach(this::load);',
      ),
    ).toEqual(['listing']);
    expect(
      java('import com.aliyun.oss.OSS;', 'ObjectListing listing = oss.listObjects(request);'),
    ).toEqual(['listing']);
    expect(
      java(
        'import com.amazonaws.services.s3.AmazonS3;',
        'ObjectListing listing = s3.listObjects(bucket);',
      ),
    ).toEqual(['listing']);
  });

  it('reports a search without a limit', () => {
    expect(java(JEDIS, 'SearchResult result = jedis.ftSearch(index, query);')).toEqual(['search']);
  });

  it('allows paginators, marker loops, existence checks and other clients', () => {
    expect(
      java(AWS, 's3Client.listObjectsV2Paginator(request).contents().forEach(this::load);'),
    ).toEqual([]);
    expect(
      java(
        AWS,
        'do {\nr = s3Client.listObjectsV2(request);\ntoken = r.nextContinuationToken();\n} while (r.isTruncated());',
      ),
    ).toEqual([]);
    expect(
      java(
        AWS,
        'var request = ListObjectsV2Request.builder().maxKeys(1).build();\nvar r = s3Client.listObjectsV2(request);',
      ),
    ).toEqual([]);
    expect(java('import io.minio.MinioClient;', 'var items = minio.listObjects(args);')).toEqual(
      [],
    );
    expect(
      java(JEDIS, 'query.limit(0, 100);\nSearchResult result = jedis.ftSearch(index, query);'),
    ).toEqual([]);
    expect(java(JEDIS, 'SearchResult result = jedis.ftSearch(index, query, params);')).toEqual([]);
    expect(
      java(
        JEDIS,
        'do {\nresult = jedis.ftSearch(index, query);\ndelete(result);\n} while (!result.getDocuments().isEmpty());',
      ),
    ).toEqual([]);
    expect(java('', 'var items = repository.listObjects(request);')).toEqual([]);
  });
});
