package reactor.core.publisher;

import java.util.function.Function;
import java.util.function.Supplier;
import reactor.util.retry.Retry;

public abstract class Mono<T> {
  public static <T> Mono<T> just(T value) {
    return null;
  }

  public static <T> Mono<T> empty() {
    return null;
  }

  public static <T> Mono<T> defer(Supplier<? extends Mono<? extends T>> supplier) {
    return null;
  }

  public <R> Mono<R> map(Function<? super T, ? extends R> mapper) {
    return null;
  }

  public <R> Mono<R> flatMap(Function<? super T, ? extends Mono<? extends R>> mapper) {
    return null;
  }

  public Mono<T> onErrorResume(Class<? extends Throwable> type, Function<Throwable, Mono<T>> fallback) {
    return this;
  }

  public Mono<T> retry(long attempts) {
    return this;
  }

  public Mono<T> retryWhen(Retry retry) {
    return this;
  }
}
