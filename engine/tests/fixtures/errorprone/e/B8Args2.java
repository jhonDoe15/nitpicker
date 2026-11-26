package e;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;

class B8Args2 {
  record Pair(String left, String right) {}

  static void pairs(Object o) {
    if (o instanceof Pair(String left, String right)) {
      System.out.println(left + right);
    }
    if (o instanceof Pair(String right, String left)) {
      System.out.println(left + right);
    }
  }

  static void make(String left, String right) {
    new Pair(right, left);
    new Pair(left, right);
  }

  void area(int width, int height) {}

  void anonymous(int width, int height) {
    Object o =
        new Object() {
          void inner() {
            area(height, width);
          }
        };
  }

  void lambda(int width, int height) {
    Runnable r = () -> area(height, width);
  }

  <T> void recur(T source, T target) {
    recur(target, source);
  }

  class Inner {
    Inner(int width, int height) {}
  }

  void inner(int width, int height) {
    new Inner(height, width);
    new Inner(width, height) {};
  }

  void blockComment(int width, int height) {
    area(/* height */ height, /* width */ width);
    area(/*width*/ height, /*height*/ width);
    area(height /* width= */, width /* height= */);
    area(
        height, // a very long comment about the width of something that goes on and on for a long time
        width);
  }

  static class Outer {
    void each(String key, String names) {}

    void use(String names, String key) {
      each(names, key);
    }
  }

  void overloaded(String first, String second) {}

  void overloaded(int first, int second) {}

  void callOverloaded(String second, String first, int one, int two) {
    overloaded(second, first);
    overloaded(two, one);
  }

  void names(String prefix, String suffix) {}

  void callNames(String suffix, String prefix) {
    names(suffix, prefix);
    names(prefix, suffix);
  }

  void qualified(B8Args2 other, String nameLeft, String nameRight) {
    names(other.nameLeft(), other.nameRight());
    names(other.nameRight(), other.nameLeft());
  }

  String nameLeft() {
    return "";
  }

  String nameRight() {
    return "";
  }

  void undoing(String prefix, String suffix) {
    names(suffix, prefix);
  }

  void constants() {
    final String prefix = "a";
    final String suffix = "b";
    names(suffix, prefix);
  }

  void arrays(int[] width, int[] height) {}

  void callArrays(int[] width, int[] height) {
    arrays(height, width);
  }

  void boxed(Integer width, Integer height) {}

  void callBoxed(int width, Integer height) {
    boxed(height, width);
  }

  void walls(String wallLeft, String wallRight, String ceiling) {}

  void callWalls(String wallRight, String ceiling, String wallLeft) {
    walls(wallRight, ceiling, wallLeft);
  }
}
