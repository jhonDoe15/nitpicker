package io.reactivex;

public abstract class Flowable<T> {
  public static <T> Flowable<T> just(T item) {
    return null;
  }

  public <R> Flowable<R> map(java.util.function.Function<T, R> mapper) {
    return null;
  }

  public Object subscribe() {
    return null;
  }
}
