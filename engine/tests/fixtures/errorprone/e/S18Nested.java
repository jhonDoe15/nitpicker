import java.util.ArrayList;
import java.util.List;

class S18Nested {
  static class ClassA {}

  static class ClassB {}

  static class ClassC {}

  static class SuperClass {}

  static class SubClass extends SuperClass {}

  static class DisjointClass {}

  interface Face {}

  interface Other {}

  static final class FinalClass {}

  static class Open {}

  record Rec(int x) {}

  enum En { A }

  sealed interface Shape permits Circle, Square {}

  static final class Circle implements Shape {}

  static final class Square implements Shape {}

  sealed interface Sealed2 permits Impl2 {}

  static final class Impl2 implements Sealed2 {}

  static sealed class SealedBase permits SealedSub {}

  static final class SealedSub extends SealedBase {}

  void positives() {
    Object foo = new ClassA();
    Object bar = new ClassB();
    if (foo instanceof ClassA) {
      if (foo instanceof ClassB) {
        System.out.println("test");
      }
    }
    if (foo instanceof ClassA) {
      System.out.println("test");
      if (foo instanceof ClassB) {
        System.out.println("test");
      }
      System.out.println("test");
    }
    if (foo instanceof ClassA) {
      if (foo instanceof ClassA) {
        if (foo instanceof ClassB) {
          System.out.println("test");
        }
      }
    }
    if (foo instanceof ClassA) {
      if (foo instanceof ClassB) {
        if (foo instanceof ClassC) {
          System.out.println("test");
        }
      }
    }
    if (foo instanceof ClassA) {
      if (bar instanceof ClassB) {
        if (foo instanceof ClassC) {
          System.out.println("test");
        }
      }
    }
    if (foo instanceof ClassA) {
      System.out.println("yay");
    } else if (foo instanceof ClassB) {
      if (foo instanceof ClassC) {
        System.out.println("uh oh");
      }
    }
  }

  void negatives(Object objectA, Object objectB) {
    if (objectA instanceof SuperClass) {
      if (objectB instanceof DisjointClass) {
        System.out.println("yay");
      }
    }
    if (objectA instanceof SuperClass) {
      if (objectA instanceof SubClass) {
        System.out.println("yay");
      }
    }
    if (objectA instanceof SuperClass) {
      if (objectA instanceof SubClass) {
        if (objectB instanceof DisjointClass) {
          System.out.println("yay");
        }
      }
    }
    if (objectA instanceof SuperClass) {
      if (objectB instanceof DisjointClass) {
        if (objectA instanceof SubClass) {
          System.out.println("yay");
        }
      }
    }
    if (objectA instanceof SuperClass) {
      System.out.println("yay");
    } else if (objectA instanceof DisjointClass) {
      System.out.println("boo");
    } else if (objectA instanceof String) {
      System.out.println("aww");
    }
    if (objectA instanceof SuperClass) {
      objectA = "yay";
      if (objectA instanceof String) {
        System.out.println();
      }
    }
    if (objectA instanceof SuperClass) {
      if (objectA instanceof String) {
        objectA = "yay";
      }
    }
    List<Object> ls = new ArrayList<Object>();
    ls.add("hi");
    if (ls.get(0) instanceof String) {
      if (ls.get(0) instanceof SuperClass) {
        System.out.println("lol");
      }
    }
  }

  @SuppressWarnings("NestedInstanceOfConditions")
  void suppressed(Object o) {
    if (o instanceof ClassA) {
      if (o instanceof ClassB) {
        System.out.println();
      }
    }
  }

  void castability(Object o, Number n, Runnable r, CharSequence cs, Comparable<String> c) {
    if (o instanceof Face) {
      if (o instanceof ClassA) {
        System.out.println();
      }
      if (o instanceof FinalClass) {
        System.out.println();
      }
    }
    if (r instanceof Face) {
      if (r instanceof Other) {
        System.out.println();
      }
    }
    if (n instanceof Integer) {
      if (n instanceof Long) {
        System.out.println();
      }
    }
    if (cs instanceof String) {
      if (cs instanceof StringBuilder) {
        System.out.println();
      }
    }
    if (o instanceof Rec) {
      if (o instanceof Face) {
        System.out.println();
      }
    }
    if (o instanceof Face) {
      if (o instanceof Rec) {
        System.out.println();
      }
    }
    if (o instanceof En) {
      if (o instanceof Face) {
        System.out.println();
      }
    }
    if (o instanceof Shape) {
      if (o instanceof ClassA) {
        System.out.println();
      }
    }
    if (o instanceof ClassA) {
      if (o instanceof Shape) {
        System.out.println();
      }
    }
    if (o instanceof Sealed2) {
      if (o instanceof Face) {
        System.out.println();
      }
    }
    if (o instanceof Face) {
      if (o instanceof Sealed2) {
        System.out.println();
      }
    }
    if (o instanceof Sealed2) {
      if (o instanceof Shape) {
        System.out.println();
      }
    }
    if (o instanceof SealedBase) {
      if (o instanceof Other) {
        System.out.println();
      }
    }
    if (o instanceof Open) {
      if (o instanceof Other) {
        System.out.println();
      }
    }
    if (o instanceof int[]) {
      if (o instanceof long[]) {
        System.out.println();
      }
    }
    if (o instanceof Object[]) {
      if (o instanceof String) {
        System.out.println();
      }
    }
    if (o instanceof String[]) {
      if (o instanceof Integer[]) {
        System.out.println();
      }
    }
  }

  void patterns(Object o) {
    if (o instanceof ClassA a) {
      if (o instanceof ClassB b) {
        System.out.println();
      }
    }
    if (o instanceof ClassA) {
      if (o instanceof ClassB b) {
        System.out.println();
      }
    }
    if (o instanceof ClassA a) {
      if (o instanceof ClassB) {
        System.out.println();
      }
    }
    if (o instanceof Rec(int x)) {
      if (o instanceof ClassB) {
        System.out.println();
      }
    }
    if (o instanceof ClassA) {
      if (o instanceof Rec(int x)) {
        System.out.println();
      }
    }
    if ((o instanceof ClassA)) {
      if (((o instanceof ClassB))) {
        System.out.println();
      }
    }
    if (o instanceof ClassA) {
      if (o instanceof ClassB && true) {
        System.out.println();
      }
    }
    if (o instanceof ClassA) {
      while (true) {
        if (o instanceof ClassB) {
          break;
        }
      }
    }
    if (o instanceof ClassA) {
      Runnable r = () -> {
        if (o instanceof ClassB) {
          System.out.println();
        }
      };
    }
  }

  void assignments(Object o, Object p) {
    if (o instanceof ClassA) {
      p = o;
      if (o instanceof ClassB) {
        System.out.println();
      }
    }
    if (o instanceof ClassA) {
      if (o instanceof ClassB) {
        System.out.println();
      }
      o = null;
    }
    if (o instanceof ClassA) {
      System.out.println();
    } else {
      o = p;
    }
    if (o instanceof ClassA) {
      if (o instanceof ClassB) {
        System.out.println();
      }
    } else {
      o = p;
    }
  }

  void compound(String s) {
    Object o = s;
    if (o instanceof ClassA) {
      if (o instanceof ClassB) {
        System.out.println();
      }
    }
  }
}
