package p;
public class A {
  int outerField;
  class Inner { Inner() { outerField = 2; } }
  class Plain { int z; Plain() { z = 1; } }
  void m() { new Inner(); new Plain(); }
}
