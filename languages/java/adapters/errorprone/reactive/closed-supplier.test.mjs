import { describe, expect, it } from 'vitest';
import { isClosedByUsing } from './closed-supplier.mjs';

const MESSAGE =
  '[StreamResourceLeak] Streams that encapsulate a closeable resource should be closed using try-with-resources';
const HEADER = 'import reactor.core.publisher.Flux;\nimport reactor.core.publisher.Mono;\n';

function flagged(body, { marker = 'Files.', message = MESSAGE, header = HEADER } = {}) {
  const source = `${header}class A {\n  Object run() {\n    return ${body};\n  }\n}\n`;
  return isClosedByUsing({ message, position: source.indexOf(marker) + 5 }, source);
}

describe('a stream that Flux.using or Mono.using closes', () => {
  it.each([
    [
      'BaseStream::close',
      'Flux.using(() -> Files.walk(path, 2), Flux::fromStream, BaseStream::close)',
    ],
    ['Stream::close', 'Flux.using(() -> Files.list(dir), Flux::fromStream, Stream::close)'],
    [
      'AutoCloseable::close',
      'Mono.using(() -> Files.lines(file), s -> Mono.just(s.count()), AutoCloseable::close)',
    ],
    [
      'a lambda calling close()',
      'Flux.using(() -> Files.list(dir), Flux::fromStream, s -> s.close())',
    ],
    [
      'a lambda with a block',
      'Flux.using(() -> Files.list(dir), Flux::fromStream, s -> { s.close(); })',
    ],
    ['an eager flag', 'Flux.using(() -> Files.list(dir), Flux::fromStream, Stream::close, false)'],
    [
      'a block supplier that returns the stream',
      'Flux.using(() -> { return Files.list(dir); }, Flux::fromStream, Stream::close)',
    ],
    ['a type witness', 'Flux.<Path>using(() -> Files.list(dir), Flux::fromStream, Stream::close)'],
    [
      'a chain on the stream',
      'Flux.using(() -> Files.walk(p).filter(Files::isRegularFile), Flux::fromStream, Stream::close)',
    ],
  ])('is not reported with %s', (_name, body) => {
    expect(flagged(body)).toBe(true);
  });

  it.each([
    'Flux.usingWhen(Mono.fromCallable(() -> Files.list(dir)), s -> Flux.fromStream(s), s -> Mono.fromRunnable(s::close))',
    'Flux.usingWhen(Mono.fromSupplier(() -> Files.walk(p)), Flux::fromStream, s -> Mono.fromRunnable(() -> s.close()), (s, e) -> Mono.empty(), s -> Mono.empty())',
  ])('is not reported in usingWhen with a close in its async cleanup: %s', (body) => {
    expect(flagged(body)).toBe(true);
  });
});

describe('a stream that stays reported', () => {
  it.each([
    [
      'a cleanup that does not close',
      'Flux.using(() -> Files.list(dir), Flux::fromStream, s -> log(s))',
    ],
    [
      'a cleanup of another resource',
      'Flux.using(() -> Files.list(dir), Flux::fromStream, s -> other.close())',
    ],
    [
      'a bound method reference',
      'Flux.using(() -> Files.list(dir), Flux::fromStream, holder::close)',
    ],
    ['a noop cleanup', 'Flux.using(() -> Files.list(dir), Flux::fromStream, s -> {})'],
    ['a stream used outside a supplier', 'Flux.fromStream(Files.list(dir))'],
    [
      'a stream in the mapper',
      'Flux.using(() -> dir, d -> Flux.fromStream(Files.list(d)), Path::close)',
    ],
    [
      'a supplier that opens a second stream',
      'Flux.using(() -> { var a = Files.list(x); return Files.list(y); }, Flux::fromStream, Stream::close)',
    ],
    [
      'usingWhen without a close',
      'Flux.usingWhen(Mono.fromSupplier(() -> Files.list(dir)), Flux::fromStream, s -> Mono.empty())',
    ],
  ])('keeps %s', (_name, body) => {
    expect(flagged(body)).toBe(false);
  });

  it('keeps other checks, other classes named Flux and sources without Reactor', () => {
    const body = 'Flux.using(() -> Files.list(dir), Flux::fromStream, Stream::close)';
    expect(flagged(body, { message: '[OtherCheck] text' })).toBe(false);
    expect(flagged(body, { header: 'import my.Flux;\n' })).toBe(false);
  });
});
