# Object-store and search listings read once

An object-store or search listing read with one call, with no loop on its page marker, is an enforceable
`pmd/UnpagedListing` finding (`languages/java/adapters/review-rules/object-listings/`), in the Java and Kotlin
presets alike. The API returns one page (1000 keys for S3-style listings, 10 documents for RediSearch
`FT.SEARCH`) and expects the caller to follow a truncation flag, a continuation token or an offset. With more
objects than one page the rest is silently ignored: a resource browser lists the first 1000 files, a document loader
skips documents, a `clear()` leaves rows behind. Merged fixes in open-source projects (a workflow scheduler, an LLM
framework, an AI application framework) replaced the single call with the paginator or a loop.

- **Reported:** `listObjectsV2(request)`, `listObjects(request)` or `listObjectVersions(request)` in a file that
  imports the AWS SDK (v1 or v2), the Aliyun OSS or the Tencent COS client, when the same method does not read a
  page marker (`isTruncated`, `nextContinuationToken`, `getNextContinuationToken`, `getNextMarker`, `marker`,
  `startAfter`, `listNextBatchOfObjects`) and does not set `maxKeys(1)`; and a Jedis `ftSearch(index, query)` with two
  arguments, in a method that sets no `limit(...)` and does not call it inside a loop.
- **Allowed forms, not reported:** the SDK paginator (`listObjectsV2Paginator(request)`), a loop over the marker,
  an existence check with `maxKeys(1)`, a MinIO listing (its iterable already follows the pages), a search loop that
  repeats until a page comes back empty (a delete-and-search loop), and any client whose SDK the file does not import.
- **Not covered:** Azure Blob and Google Cloud Storage page iteration, Lettuce searches, a marker read in another
  method, and paging helpers in other modules. The table of SDK packages, calls and markers is at the top of
  `object-listings.mjs`, so a new SDK is a data change.

The message names the paginator and ends with the exception sentence for
`{ "rule": "pmd/UnpagedListing", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/object-listings/object-listings.test.mts`. The TypeScript and JavaScript counterpart is
`nitpicker/no-unpaged-listing`.
