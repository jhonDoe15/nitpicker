package e;

import java.lang.reflect.InvocationTargetException;

class B5Reflect {
  Object throwsClause(Class<?> c) throws InstantiationException, IllegalAccessException {
    return c.newInstance();
  }

  Object throwsOther(Class<?> c) throws java.io.IOException, InstantiationException, IllegalAccessException {
    return c.newInstance();
  }

  Object throwsAll(Class<?> c) throws ReflectiveOperationException {
    return c.newInstance();
  }

  Object throwsException(Class<?> c) throws Exception {
    return c.newInstance();
  }

  Object caught(Class<?> c) {
    try {
      return c.newInstance();
    } catch (InstantiationException | IllegalAccessException e) {
      throw new RuntimeException(e);
    }
  }

  Object caughtSeparate(Class<?> c) {
    try {
      return c.newInstance();
    } catch (InstantiationException e) {
      throw new RuntimeException(e);
    } catch (IllegalAccessException e) {
      throw new RuntimeException(e);
    }
  }

  Object caughtDifferent(Class<?> c) {
    try {
      return c.newInstance();
    } catch (InstantiationException e) {
      throw new RuntimeException("a", e);
    } catch (IllegalAccessException e) {
      throw new IllegalStateException(e);
    }
  }

  Object caughtException(Class<?> c) {
    try {
      return c.newInstance();
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  Object caughtAll(Class<?> c) {
    try {
      return c.newInstance();
    } catch (ReflectiveOperationException e) {
      throw new RuntimeException(e);
    }
  }

  Object caughtMixed(Class<?> c) {
    try {
      return c.newInstance();
    } catch (IllegalStateException | InstantiationException | IllegalAccessException e) {
      throw new RuntimeException(e);
    }
  }

  Object inCatch(Class<?> c) {
    try {
      return null;
    } catch (IllegalStateException e) {
      try {
        return c.newInstance();
      } catch (InstantiationException | IllegalAccessException f) {
        throw new RuntimeException(f);
      }
    }
  }

  Object insideTryWithoutCatch(Class<?> c) throws InstantiationException, IllegalAccessException {
    try {
      return c.newInstance();
    } finally {
      System.out.println();
    }
  }

  Object lambda(Class<?> c) {
    java.util.function.Supplier<Object> s = () -> {
      try {
        return c.newInstance();
      } catch (InstantiationException | IllegalAccessException e) {
        throw new RuntimeException(e);
      }
    };
    return s.get();
  }

  Object generic(Class<? extends Number> c) throws Exception {
    return c.newInstance();
  }

  Object chained() throws Exception {
    return Class.forName("a").newInstance();
  }

  Object ok(Class<?> c) throws Exception {
    return c.getDeclaredConstructor().newInstance();
  }

  Object catchesAndReflectives(Class<?> c) {
    try {
      return c.newInstance();
    } catch (InstantiationException | IllegalAccessException e) {
      throw new RuntimeException(e);
    } catch (RuntimeException e) {
      throw e;
    }
  }

  Object nested(Class<?> c) {
    try {
      return c.newInstance();
    } catch (InstantiationException e) {
      return new B5Reflect().tryAgain(c);
    } catch (IllegalAccessException e) {
      return new B5Reflect().tryAgain(c);
    }
  }

  Object tryAgain(Class<?> c) {
    return null;
  }

  Object inCatchWithNew(Class<?> c) {
    try {
      return c.newInstance();
    } catch (InstantiationException e) {
      try {
        return c.newInstance();
      } catch (Exception g) {
        return null;
      }
    } catch (IllegalAccessException e) {
      try {
        return c.newInstance();
      } catch (Exception g) {
        return null;
      }
    }
  }
}
