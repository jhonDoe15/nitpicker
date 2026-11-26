package dagger.internal;

public interface Factory<T> {
  T get();
}
