package shop.async;

import java.io.IOException;
import java.io.StringReader;
import java.util.function.Consumer;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public final class ReactiveCleanup {
  static final class FrameDecoder {
    String decode(String raw) {
      return raw.trim();
    }

    void discard() {
      decode("");
    }
  }

  static final class EventStream implements AutoCloseable {
    void subscribe(Consumer<String> consumer) {
      consumer.accept("event");
    }

    @Override
    public void close() {
      subscribe(event -> {});
    }
  }

  Flux<String> decodesAndDiscardsOnTerminate(Flux<String> source, FrameDecoder decoder) {
    return source // violation: ReactorCleanupSkippedOnCancel
        .map(decoder::decode)
        .doOnTerminate(decoder::discard);
  }

  Mono<String> releasesAfterTerminate(Mono<String> source, EventStream stream) {
    return source // violation: ReactorCleanupSkippedOnCancel
        .map(String::trim)
        .doAfterTerminate(() -> stream.close());
  }

  Flux<String> releasesOnCompleteAndOnError(Flux<String> source, EventStream stream) {
    return source // violation: ReactorCleanupSkippedOnCancel
        .doOnComplete(stream::close)
        .doOnError(error -> stream.close());
  }

  Flux<String> discardsInFinally(Flux<String> source, FrameDecoder decoder) {
    return source.map(decoder::decode).doFinally(signal -> decoder.discard());
  }

  Flux<String> discardsOnCancelToo(Flux<String> source, FrameDecoder decoder) {
    return source.doOnTerminate(decoder::discard).doOnCancel(decoder::discard);
  }

  Mono<String> onlyCounts(Mono<String> source, FrameDecoder decoder) {
    return source.doOnTerminate(() -> decoder.decode("done"));
  }

  Flux<String> completesWithoutRelease(Flux<String> source, EventStream stream) {
    return source.doOnComplete(stream::close);
  }

  Mono<String> usingReleasesOnEverySignal(Mono<String> source) {
    return Mono.using(EventStream::new, stream -> source, EventStream::close);
  }

  Flux<String> opensWithoutDispose() {
    return Flux.create(
        sink -> {
          EventStream stream = new EventStream(); // violation: ReactorResourceNotReleasedOnCancel
          stream.subscribe(sink::next);
        });
  }

  Flux<String> readsWithoutClosing(String text) {
    return Flux.push(
        sink -> {
          StringReader reader = new StringReader(text); // violation: ReactorResourceNotReleasedOnCancel
          try {
            sink.next(String.valueOf(reader.read()));
          } catch (IOException e) {
            sink.error(e);
          }
        });
  }

  Mono<String> registersOnDispose() {
    return Mono.create(
        sink -> {
          EventStream stream = new EventStream();
          sink.onDispose(stream::close);
          stream.subscribe(sink::success);
        });
  }

  Flux<String> registersOnCancel() {
    return Flux.create(
        sink -> {
          EventStream stream = new EventStream();
          sink.onCancel(() -> stream.close());
          stream.subscribe(sink::next);
        });
  }

  Flux<String> closesInTheLambda() {
    return Flux.create(
        sink -> {
          EventStream stream = new EventStream();
          stream.subscribe(sink::next);
          stream.close();
          sink.complete();
        });
  }

  private final java.util.List<EventStream> open = new java.util.ArrayList<>();

  Flux<String> handsTheStreamOn() {
    return Flux.create(
        sink -> {
          EventStream stream = new EventStream();
          open.add(stream);
          stream.subscribe(sink::next);
        });
  }

  Flux<String> closesInTryWithResources(String text) {
    return Flux.push(
        sink -> {
          try (StringReader reader = new StringReader(text)) {
            sink.next(String.valueOf(reader.read()));
          } catch (IOException e) {
            sink.error(e);
          }
        });
  }

  Flux<String> closesInFinally(String text) {
    return Flux.push(
        sink -> {
          StringReader reader = new StringReader(text);
          try {
            sink.next(String.valueOf(reader.read()));
          } catch (IOException e) {
            sink.error(e);
          } finally {
            reader.close();
          }
        });
  }

  Mono<String> releasesInsideUsing(Mono<String> source, FrameDecoder decoder) {
    return Mono.using(
        EventStream::new,
        stream -> source.doOnTerminate(() -> stream.close()),
        EventStream::close);
  }

  Mono<String> nothingToCancel(EventStream stream) {
    return Mono.just("ready").doOnTerminate(stream::close);
  }

  Mono<String> nothingToCancelEither(EventStream stream) {
    return Mono.<String>empty().doOnTerminate(stream::close);
  }
}
