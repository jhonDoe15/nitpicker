package io.reactivex;

public abstract class Single<T> {
  public static <T> Single<T> just(T item) {
    return null;
  }

  public <R> Single<R> map(java.util.function.Function<T, R> mapper) {
    return null;
  }

  public Object subscribe() {
    return null;
  }
}
