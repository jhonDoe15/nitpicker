package e;

import java.lang.annotation.ElementType;
import java.lang.annotation.Target;

class OverridesTyped {
  @Target(ElementType.TYPE_USE) @interface T {}
  @Target({ElementType.TYPE_USE, ElementType.METHOD}) @interface B {}
  static class Base {
    public void f(@T String s) {}
    public void g(String s) {}
    @T public Object h() { return null; }
    public Object i() { return null; }
    @B public Object j() { return null; }
    public String toString() { return ""; }
  }
  static class Sub extends Base {
    @Override public void f(String s) { super.f(s); }
    @Override public void g(@T String s) { super.g(s); }
    @Override public Object h() { return super.h(); }
    @Override @T public Object i() { return super.i(); }
    @Override public Object j() { return super.j(); }
    @Override public @T String toString() { return super.toString(); }
  }
  static class Sub2 extends java.util.ArrayList<String> {
    @Override public boolean add(@T String s) { return super.add(s); }
    @Override public @T String get(int i) { return super.get(i); }
  }
}
