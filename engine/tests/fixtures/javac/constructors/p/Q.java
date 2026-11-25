package p;
public class Q {
  class Inner { Inner(int a) {} }
  Q other; Q mk() { return this; }
  void m(int x) {
    Object c  = this.new Inner(x) { int g = x; };
    Object c2 = other.new Inner(x) { };
    Object c3 = mk().new Inner(x) { };
    Object c4 = new Inner(x) { };
  }
  static void s(Q a, int x) {
    Object c = a.new Inner(x) { int g = x; };
  }
  Q(int q) { Object c = this.new Inner(q) { }; Object d = new Inner(q) { }; }
  class Deep { Deep() { Object c = new Inner(1) { }; Object d = Q.this.new Inner(2) { }; } }
}
