package p;
import java.util.*;
import java.util.function.*;
public class Refs {
  static class Base {
    String name() { return ""; }
    static String st(Base b) { return ""; }
    String two(int i) { return ""; }
  }
  static class Sub extends Base {}
  static <T> T first(List<T> l, Function<T, String> f) { return null; }
  static <T> T one(T a, Function<T, String> f) { return a; }
  static <T> T flip(Function<T, String> f, T a) { return a; }
  static <T> T bi(T a, BiFunction<T, Integer, String> f) { return a; }
  static <T> T gen(Function<T, String> f) { return null; }
  static <T> void run(T t, Consumer<T> c) {}
  void m1(List<Sub> subs) { run(first(subs, Base::name), x -> {}); }
  void m2(Sub s) { run(one(s, Base::name), x -> {}); }
  void m3(Sub s) { run(flip(Base::name, s), x -> {}); }
  void m4(Sub s) { run(one(s, Base::st), x -> {}); }
  void m5(Sub s) { run(bi(s, Base::two), x -> {}); }
  void m6() { run(gen(Base::name), x -> {}); }
  void m7() { run(gen(Object::toString), x -> {}); }
  void m8(Sub s) { run(one(s, Object::toString), x -> {}); }
  void m9(List<String> l) { run(first(l, CharSequence::toString), x -> {}); }
  void m10(Sub s) { run(one(s, String::valueOf), x -> {}); }
}
