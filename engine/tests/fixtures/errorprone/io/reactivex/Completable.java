package io.reactivex;

public abstract class Completable {
  public static Completable complete() {
    return null;
  }

  public Completable andThen(Completable next) {
    return this;
  }

  public Object subscribe() {
    return null;
  }
}
