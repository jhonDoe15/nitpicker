package reactor.core.publisher;

import java.util.List;
import java.util.function.Function;
import java.util.stream.Stream;

public abstract class Flux<T> {
  public static <T> Flux<T> fromIterable(Iterable<? extends T> items) {
    return null;
  }

  public static <T> Flux<T> fromStream(Stream<? extends T> items) {
    return null;
  }

  public static <T> Flux<T> fromArray(T[] items) {
    return null;
  }

  public final <R> Flux<R> map(Function<? super T, ? extends R> mapper) {
    return null;
  }

  public final <R> Flux<R> flatMap(Function<? super T, ? extends Mono<? extends R>> mapper) {
    return null;
  }

  public final <R> Flux<R> flatMap(Function<? super T, ? extends Mono<? extends R>> mapper, int concurrency) {
    return null;
  }

  public final Flux<List<T>> buffer(int size) {
    return null;
  }

  public final Mono<List<T>> collectList() {
    return null;
  }

  public final <R> Flux<R> flatMapSequential(Function<? super T, ? extends Mono<? extends R>> mapper) {
    return null;
  }

  public final <R> Flux<R> concatMap(Function<? super T, ? extends Mono<? extends R>> mapper) {
    return null;
  }

  public final Flux<T> filter(java.util.function.Predicate<? super T> predicate) {
    return null;
  }
}
