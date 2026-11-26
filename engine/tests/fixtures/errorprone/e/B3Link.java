import java.util.List;

public interface B3Link<T> {
  /** {@link #bar()} */
  void foo();

  /** {@link #bar(B3Link<String>)} */
  void foo2(B3Link<String> foo);

  /** {@link B3Link} {@link List} {@link IllegalArgumentException} {@link #foo} {@link #foo()} {@link T} */
  void valid();

  /** {@link i.dont.exist.B#foo} */
  void qualifiedMissing();

  /** {@link List#nonExistent()} */
  void listMissing();

  /** {@link java.util.List#nonExistent()} */
  void fullyQualified();

  /** {@link com.google.NonExistent#method()} */
  void classMissing();

  /** {@link List#add(List<String>)} */
  void generics();

  /** {@link List#add(Object)} {@link List#size()} {@link List#get(int)} {@link List#add(int, Object)} */
  void listOk();

  /** {@link frobnicate} {@linkplain frobnicate label} */
  void shouldBeMethod();

  /** Pass in a {@link bar} */
  void param(String bar);

  /** {@link} */
  void empty();

  /** {@link https://foo/bar/baz} */
  void http();

  /** {@link https://foo/bar/baz foo} */
  void httpLabel();

  /** {@link String#valueOf(char[])} {@link String#valueOf(int)} {@link String#valueOf(Object)} {@link String#nothing} {@link String#length} */
  void strings();

  /** {@link Object#toString()} {@link #toString()} {@link #hashCode()} {@link Math#max(int, int)} {@link Math#abs(long)} */
  void objects();

  /** {@link #CONSTANT} {@link B3Link#CONSTANT} {@link #MISSING} */
  int CONSTANT = 1;

  /** {@link Inner} {@link Inner#value()} {@link B3Link.Inner#other()} */
  void inner();

  /** {@link #foo()}, see {@link #missing(int)} */
  enum E {
    /** {@link #values()} {@link #valueOf(String)} {@link #A} {@link #B} */
    A;

    /** {@link E#A} */
    int value;
  }

  record Inner(int value) {}

  /** {@link #foo(int...)} {@link #va(String...)} */
  void va(String... names);

  @SuppressWarnings("InvalidLink")
  /** {@link #nothere()} */
  void quiet();
}

class B3LinkClass extends java.util.ArrayList<String> {
  /** {@link #toString()} {@link #size()} {@link #add(String)} {@link #add(Object)} {@link #nope()} {@link #get(long)} {@link B3LinkClass#B3LinkClass()} */
  void m() {}
}

class B3LinkGeneric {
  static <I, O> java.util.List<O> t(java.util.List<I> a, java.util.function.Function<? super I, ? extends O> f, java.util.concurrent.Executor e) {
    return null;
  }

  class Closer {
    <C extends Object & AutoCloseable> C close(C closeable, java.util.concurrent.Executor e) {
      return closeable;
    }
  }

  /** {@link B3LinkGeneric#t(List, Function, Executor)} {@link Closer#close(Object, Executor)} */
  void m() {}

  /** {@link B3LinkGeneric#t(java.util.List, java.util.function.Function, java.util.concurrent.Executor)} {@link Closer#close(Object, java.util.concurrent.Executor)} */
  void n() {}
}
