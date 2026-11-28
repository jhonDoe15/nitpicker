package com.google.inject.binder;

public interface LinkedBindingBuilder<T> {
  void toInstance(T instance);

  void to(Class<? extends T> implementation);

  void toProvider(java.util.function.Supplier<? extends T> provider);

  void toConstructor(java.lang.reflect.Constructor<? extends T> constructor);
}
