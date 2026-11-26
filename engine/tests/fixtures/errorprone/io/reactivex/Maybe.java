package io.reactivex;

public abstract class Maybe<T> {
  public static <T> Maybe<T> just(T item) {
    return null;
  }

  public <R> Maybe<R> map(java.util.function.Function<T, R> mapper) {
    return null;
  }

  public Object subscribe() {
    return null;
  }
}
