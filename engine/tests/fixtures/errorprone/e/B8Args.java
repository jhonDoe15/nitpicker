package e;

import java.util.Objects;
import java.util.List;
import java.util.Map;

class B8Args {
  void swapped(String first, String second) {}

  void callSwapped(String second, String first) {
    swapped(second, first);
  }

  void commented(String second, String first) {
    swapped(/* first= */ second, /* second= */ first);
  }

  void partlyCommented(String second, String first) {
    swapped(/* first= */ second, first);
  }

  void approximateComment(String second, String first) {
    swapped(second /* first */, first);
  }

  void lineComment(String second, String first) {
    swapped(
        second, // first
        first);
  }

  void inOrder(String first, String second) {
    swapped(first, second);
  }

  void unrelated(String a, String b) {
    swapped(a, b);
  }

  void low(int x, int y) {}

  void callLow(int y, int x) {
    low(y, x);
  }

  void sizes(int width, int height) {}

  void callSizes(int width, int height) {
    sizes(height, width);
  }

  void wrongType(int width, long height) {
    sizes(width, (int) height);
    longs(height, width);
  }

  void longs(long width, long height) {}

  void getters(Point point, int height, int width) {
    sizes(point.getHeight(), point.getWidth());
    sizes(getHeight(), getWidth());
  }

  void nulls(int width) {
    sizes(width, 0);
    sizes(0, width);
  }

  void withNull(String first, String second) {}

  void callWithNull(String second) {
    withNull(second, null);
    withNull(null, second);
  }

  int getWidth() {
    return 1;
  }

  int getHeight() {
    return 1;
  }

  static class Point {
    int getWidth() {
      return 1;
    }

    int getHeight() {
      return 2;
    }
  }

  static class Rect {
    Rect(int left, int right, int top, int bottom) {}

    Rect(String name) {}

    static void make(int left, int right, int top, int bottom) {
      new Rect(right, left, top, bottom);
      new Rect(left, right, bottom, top);
      new Rect(left, right, top, bottom);
    }
  }

  static class Sub extends Rect {
    Sub(int left, int right, int top, int bottom) {
      super(right, left, top, bottom);
    }

    Sub(int left, int right) {
      this(right, left, 0, 0);
    }
  }

  enum Edge {
    A(1, 2);

    Edge(int low, int high) {}
  }

  void reverseOfThings(int width, int height) {
    sizes(height, width);
  }

  void flip(int width, int height) {
    sizes(height, width);
  }

  void duplicate(int width, int height) {
    sizes(height, width);
    sizes(width, height);
  }

  void duplicateElsewhere(int width, int height) {
    sizes(width, height);
    sizes(height, width);
  }

  void recursive(int width, int height) {
    recursive(height, width);
  }

  void jdk(int offset, int length, byte[] channel) {
    Objects.checkFromIndexSize(offset, length, channel.length);
    Objects.checkFromIndexSize(offset, channel.length, length);
  }

  void varargs(String first, String second, Object... rest) {}

  void callVarargs(String second, String first) {
    varargs(second, first, 1, 2);
  }

  void strings(String name, String value) {}

  void callStrings(String name, String value) {
    strings(value, name);
  }

  void generics(List<String> names, List<Integer> counts) {}

  void callGenerics(List<String> names, List<Integer> counts) {
    generics(names, counts);
  }

  void sameGeneric(List<String> names, List<String> keys) {}

  void callSameGeneric(List<String> keys, List<String> names) {
    sameGeneric(keys, names);
  }

  <T> void typeVariables(T source, T target) {}

  <T> void callTypeVariables(T target, T source) {
    typeVariables(target, source);
  }

  void mapPut(Map<String, String> source, Map<String, String> target) {
    source.putAll(target);
  }

  @SuppressWarnings("ArgumentSelectionDefectChecker")
  void suppressed(String second, String first) {
    swapped(second, first);
  }

  void chain(Point point) {
    sizes(point.getHeight(), getWidth());
    sizes(this.getHeight(), this.getWidth());
  }

  void thisArgument(B8Args args) {
    sameClass(args, this);
  }

  void sameClass(B8Args other, B8Args args) {}

  void newInstance() {
    swapped(String.valueOf(1), new String("x"));
  }

  void multiline(String second, String first) {
    swapped(
        second,
        first);
  }
}
