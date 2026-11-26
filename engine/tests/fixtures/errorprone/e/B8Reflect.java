package e;

import java.lang.reflect.Constructor;
import java.util.List;
import java.util.Map;

class B8Reflect {
  Object plain(String name) throws Exception {
    return (Runnable) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object withGetConstructor(String name) throws Exception {
    return (Runnable) Class.forName(name).getConstructor(String.class).newInstance("x");
  }

  Object parenthesized(String name) throws Exception {
    return (Runnable) (Class.forName(name).getDeclaredConstructor().newInstance());
  }

  Object generic(String name) throws Exception {
    return (List<String>) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object raw(String name) throws Exception {
    return (List) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object qualified(String name) throws Exception {
    return (java.util.Map.Entry<String, String>) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object qualifiedRaw(String name) throws Exception {
    return (java.util.concurrent.Callable) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object nested(String name) throws Exception {
    return (Map.Entry) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object ownNested(String name) throws Exception {
    return (Inner) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object objectCast(String name) throws Exception {
    return (Object) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  <T> T typeVariable(String name) throws Exception {
    return (T) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object asSubclassAlready(String name) throws Exception {
    return (Runnable) Class.forName(name).asSubclass(Runnable.class).getDeclaredConstructor().newInstance();
  }

  Object notForName(Class<?> c) throws Exception {
    return (Runnable) c.getDeclaredConstructor().newInstance();
  }

  Object ctorVariable(Constructor<?> ctor) throws Exception {
    return (Runnable) ctor.newInstance();
  }

  Object plainNewInstance(String name) throws Exception {
    return (Runnable) Class.forName(name).newInstance();
  }

  Object withLoader(String name, ClassLoader loader) throws Exception {
    return (Runnable) Class.forName(name, true, loader).getDeclaredConstructor().newInstance();
  }

  Object array(String name) throws Exception {
    return (Runnable[]) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object assignedCast(String name) throws Exception {
    Runnable r = (Runnable) Class.forName(name).getDeclaredConstructor().newInstance();
    return r;
  }

  @SuppressWarnings("UnsafeReflectiveConstructionCast")
  Object suppressed(String name) throws Exception {
    return (Runnable) Class.forName(name).getDeclaredConstructor().newInstance();
  }

  Object spaced(String name) throws Exception {
    return (Runnable)
        Class.forName(name)
            .getDeclaredConstructor()
            .newInstance();
  }

  static class Inner {}
}
