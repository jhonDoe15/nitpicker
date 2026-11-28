package org.robolectric.shadow.api;

import org.robolectric.util.ReflectionHelpers.ClassParameter;

public class Shadow {
  public static <T> T directlyOn(T shadowedObject, Class<T> clazz) {
    return null;
  }

  public static <T> Runnable directlyOn(T shadowedObject, Class<T> clazz, String baz, ClassParameter<?>... params) {
    return null;
  }
}
