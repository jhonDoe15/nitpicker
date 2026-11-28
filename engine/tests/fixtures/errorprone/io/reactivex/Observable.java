package io.reactivex;

public abstract class Observable<T> {
  public static <T> Observable<T> just(T item) {
    return null;
  }

  public <R> Observable<R> map(java.util.function.Function<T, R> mapper) {
    return null;
  }

  public Object subscribe() {
    return null;
  }
}
