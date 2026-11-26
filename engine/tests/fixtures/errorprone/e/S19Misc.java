package e;

import java.io.IOException;
import java.util.AbstractSet;
import java.util.List;
import java.util.stream.Stream;

class S19Misc {
  void assertionErrorExceptionConstructor() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError(e);
    }
  }

  void assertionErrorStringConstructor() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError("Test", e);
    }
  }

  void assertionErrorStringFormatConstructor() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError(String.format("Test"), e);
    }
  }

  void multiLineCatchBlock() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e1) {
      int a = 100;
      if (a < 100) {
        try {
          throw new ReflectiveOperationException();
        } catch (ReflectiveOperationException e2) {
          throw new AssertionError(e2);
        }
      }
      throw new AssertionError(e1);
    }
  }

  void fullyQualified() {
    try {
      throw new ReflectiveOperationException();
    } catch (java.lang.ReflectiveOperationException e) {
      throw new java.lang.AssertionError(e);
    }
  }

  void assertionErrorNonStringConstructor() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError(1);
    }
  }

  void assertionErrorNoArgConstructor() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError();
    }
  }

  void noThrowAssertionError() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new IllegalStateException(e);
    }
  }

  void noCatchReflectiveOperationException() {
    try {
      throw new ReflectiveOperationException();
    } catch (Exception e) {
      throw new AssertionError(e);
    }
  }

  void subclass() {
    try {
      Class.forName("x");
    } catch (ClassNotFoundException e) {
      throw new AssertionError(e);
    }
  }

  void multiCatchExceptions() {
    try {
      int a = 100;
      if (a < 100) {
        throw new IOException("Test");
      }
      throw new ReflectiveOperationException();
    } catch (IOException | ReflectiveOperationException e) {
      throw new AssertionError(e);
    }
  }

  void throwNewReflectiveOperationException() {
    throw new AssertionError(new ReflectiveOperationException("Test"));
  }

  void anonymous() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError(e) {};
    }
  }

  void parenthesized() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw (new AssertionError(e));
    }
  }

  void lambdaShadow() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      Runnable r = () -> {
        throw new AssertionError(e);
      };
    }
  }

  void localVariable() {
    ReflectiveOperationException e = new ReflectiveOperationException();
    throw new AssertionError(e);
  }

  void fieldCause() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError("x", this.cause);
    }
  }

  ReflectiveOperationException cause;

  void messageCall() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError(e.getMessage(), e);
    }
  }

  @SuppressWarnings("RethrowReflectiveOperationExceptionAsLinkageError")
  void suppressed() {
    try {
      throw new ReflectiveOperationException();
    } catch (ReflectiveOperationException e) {
      throw new AssertionError(e);
    }
  }

  static class SuperEquals {
    int i;

    @Override
    public boolean equals(Object obj) {
      if (obj instanceof SuperEquals) {
        return i == ((SuperEquals) obj).i;
      }
      return super.equals(obj);
    }

    boolean notEquals(Object obj) {
      if (obj instanceof SuperEquals) {
        return i != ((SuperEquals) obj).i;
      }
      return !super.equals(obj);
    }

    boolean notEqualsParens(Object obj) {
      return !(super.equals(obj));
    }

    @Override
    public int hashCode() {
      return super.hashCode() * 31 + i;
    }

    int plainHash() {
      return super.hashCode();
    }

    int hashStatement() {
      int h = super.hashCode();
      return h;
    }

    int hashTwo() {
      if (i == 0) {
        return 0;
      }
      return super.hashCode();
    }

    boolean equalsOnlyReturn(Object obj) {
      return super.equals(obj);
    }

    boolean equalsWithComment(Object obj) {
      // comment
      return super.equals(obj);
    }

    boolean equalsInLambda(Object obj) {
      Runnable r = () -> {
        boolean b = super.equals(obj);
      };
      return false;
    }

    boolean equalsCond(Object obj) {
      return i > 0 ? super.equals(obj) : false;
    }
  }

  static class SuperException extends Exception {
    int i;

    @Override
    public boolean equals(Object obj) {
      if (obj instanceof SuperException) {
        return i == ((SuperException) obj).i;
      }
      return super.equals(obj);
    }
  }

  abstract static class SuperSet extends AbstractSet<String> {
    int i;

    @Override
    public boolean equals(Object obj) {
      if (obj instanceof SuperSet) {
        return i == ((SuperSet) obj).i;
      }
      return super.equals(obj);
    }

    @Override
    public int hashCode() {
      return super.hashCode() + 1;
    }
  }

  static class SuperOther {
    @Override
    public String toString() {
      return super.toString() + "x";
    }

    boolean thisEquals(Object o) {
      return this.equals(o) && o.equals(this);
    }
  }

  static class SuperChild extends SuperEquals {
    @Override
    public boolean equals(Object obj) {
      return super.equals(obj) && true;
    }

    @Override
    public int hashCode() {
      return super.hashCode() + 1;
    }
  }

  interface Iface {
    default boolean eq(Object o) {
      return o == this;
    }
  }

  static class WithIface implements Iface {
    @Override
    public boolean eq(Object o) {
      return Iface.super.eq(o);
    }

    @SuppressWarnings("SuperCallToObjectMethod")
    public int hashCode() {
      return super.hashCode() + 2;
    }
  }

  void addAll(Iterable<Integer> ints) {}

  void streamToIterable(List<Integer> i, Stream<Integer> field2) {
    addAll(Stream.of(1, 2, 3)::iterator);
    Stream<Integer> stream = Stream.of(1, 2, 3);
    addAll(() -> stream.iterator());
    addAll(stream::iterator);
    addAll(() -> Stream.of(1).iterator());
    addAll(() -> this.stream.iterator());
    addAll(() -> field2.iterator());
    for (int x : (Iterable<Integer>) () -> stream.iterator()) {}
    for (int x : (Iterable<Integer>) stream::iterator) {}
    for (int x : ((Iterable<Integer>) () -> stream.iterator())) {}
    Iterable<Integer> assigned = () -> stream.iterator();
    Iterable<Integer> assigned2 = stream::iterator;
    Object o = (Iterable<Integer>) stream::iterator;
    java.util.function.Supplier<java.util.Iterator<Integer>> supplier = stream::iterator;
    java.util.function.Supplier<java.util.Iterator<Integer>> supplier2 = () -> stream.iterator();
    java.util.stream.IntStream ints = java.util.stream.IntStream.of(1);
    Iterable<Integer> notStream = () -> i.iterator();
    Iterable<Integer> blockBody = () -> {
      return stream.iterator();
    };
    java.util.stream.BaseStream<Integer, Stream<Integer>> base = stream;
    Iterable<Integer> baseIter = base::iterator;
  }

  Stream<Integer> stream = Stream.of(1);

  @SuppressWarnings("StreamToIterable")
  void streamSuppressed() {
    Stream<Integer> s = Stream.of(1);
    Iterable<Integer> it = () -> s.iterator();
    Iterable<Integer> it2 = s::iterator;
  }
}
