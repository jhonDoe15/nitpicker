package e;

import java.net.URL;
import java.net.URLClassLoader;
import java.rmi.server.RMIClassLoader;
import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.naming.directory.DirContext;

@java.lang.annotation.Target(java.lang.annotation.ElementType.TYPE_USE)
@interface TypeAnn {}

class B5Ban {
  static class Loader extends ClassLoader {
    Class<?> make(byte[] bytes) {
      return defineClass("A", bytes, 0, bytes.length);
    }

    Class<?> viaThis(byte[] bytes) {
      return this.defineClass(null, bytes, 0, bytes.length);
    }

    void other() {
      findLoadedClass("A");
    }
  }

  static class Url extends URLClassLoader {
    Url(URL[] urls) {
      super(urls);
    }
  }

  static class Deep extends Url {
    Deep() {
      super(null);
    }
  }

  void make() throws Exception {
    new URLClassLoader(new URL[0]);
    new URLClassLoader(new URL[0]) {};
    new Url(null);
    new Deep();
    RMIClassLoader.loadClass("a", "b");
    RMIClassLoader.getClassLoader("a");
  }

  void jndi(Context context, DirContext dir, InitialContext initial) throws NamingException {
    context.lookup("x");
    context.bind("x", null);
    context.list("x");
    dir.search("a", null);
    dir.getAttributes("a");
    initial.lookup("a");
    InitialContext.doLookup("a");
    initial.createSubcontext("a");
    initial.getNameInNamespace();
  }

  @SuppressWarnings("BanJNDI")
  void quiet(Context context) throws NamingException {
    context.lookup("x");
  }

  void exit(int code) {
    System.exit(code);
    System.out.println();
    Runnable r = () -> System.exit(1);
    Runtime.getRuntime().exit(1);
  }

  void exitAnonymous() {
    new Object() {
      void go() {
        System.exit(2);
      }
    };
  }

  static class Main {
    public static void main(String[] args) {
      System.exit(0);
    }

    void other() {
      System.exit(1);
    }
  }

  static class VarMain {
    public static void main(String... args) {
      System.exit(0);
    }
  }

  static class WrongMain {
    static void main(String[] args) {
      System.exit(0);
    }
  }

  static class NotStatic {
    public void main(String[] args) {
      System.exit(0);
    }
  }

  static class Fields {
    static final Runnable R = () -> System.exit(3);
    static {
      System.exit(4);
    }
  }

  static class Bounds<T extends Object, U extends Comparable<U>, V extends Object & Comparable<V>> {
    <W extends java.lang.Object> void method() {}

    <Y extends @TypeAnn Object> void already() {}

    <Z extends Object & Runnable> void second() {}
  }
}
