import type { BaseFile } from '../typed/edit-types.mts';

const BLOB_HEADER_FIELDS = 3;

type BatchObjectRequest = {
  readonly output: Buffer;
  readonly offset: number;
  readonly file: BaseFile;
  readonly objectName: string | undefined;
};

type BatchRequest = {
  readonly output: Buffer;
  readonly files: readonly BaseFile[];
  readonly objectNames: readonly string[];
};

function readBatchHeader(output: Buffer, offset: number): { header: string; next: number } {
  const lineEnd = output.indexOf(10, offset);
  if (lineEnd === -1) {
    throw new Error('Malformed git cat-file output: missing object header');
  }
  return { header: output.subarray(offset, lineEnd).toString('utf8'), next: lineEnd + 1 };
}

function parseBlobSize(header: string): number {
  const fields = header.split(' ');
  const size = Number(fields[2]);
  if (
    fields.length !== BLOB_HEADER_FIELDS ||
    fields[1] !== 'blob' ||
    !Number.isSafeInteger(size) ||
    size < 0
  ) {
    throw new Error(`Malformed git cat-file object header: ${header}`);
  }
  return size;
}

function readBatchObject({ output, offset, file, objectName }: BatchObjectRequest): {
  content: string | undefined;
  next: number;
} {
  const { header, next } = readBatchHeader(output, offset);
  if (header === `${String(objectName)} missing`) {
    return { content: undefined, next };
  }
  const contentEnd = next + parseBlobSize(header);
  if (contentEnd >= output.length || output[contentEnd] !== 10) {
    throw new Error(`Malformed git cat-file content for ${file.baseRepositoryPath}`);
  }
  return { content: output.subarray(next, contentEnd).toString('utf8'), next: contentEnd + 1 };
}

export function parseBatchObjects({
  output,
  files,
  objectNames,
}: BatchRequest): Map<string, string | undefined> {
  const contents = new Map<string, string | undefined>();
  let offset = 0;
  for (const [index, file] of files.entries()) {
    const object = readBatchObject({ output, offset, file, objectName: objectNames[index] });
    contents.set(file.path, object.content);
    offset = object.next;
  }
  if (offset !== output.length) {
    throw new Error('Malformed git cat-file output: unexpected trailing data');
  }
  return contents;
}
