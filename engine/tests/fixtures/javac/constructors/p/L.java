package p;
public class L {
  void n(int x, String y, long z, char w) {
    class Lc { Lc() { System.out.println(x); } void f() { Runnable r = () -> System.out.println(y); } }
    Object i = new Lc() { void k() { System.out.println(z); } };
    Object j = new Lc() { };
    class Lc2 extends Lc { void k() { System.out.println(z); } }
    Object k = new Lc2() { };
    Object l = new Lc2() { void q() { System.out.println(w + "" + x); } };
    class Lc3 { Lc3(int a, String b) { System.out.println(w); } }
    Object m = new Lc3(1, "s") { void q() { System.out.println(z); } };
    class Lc4 extends Lc3 { Lc4() { super(1, ""); System.out.println(y); } }
    Object o = new Lc4() { };
    Object p = new Lc4();
  }
  static void s(long z, int x) {
    class SL { int q = x; }
    Object i = new SL() { void k() { System.out.println(z); } };
    Object j = new SL() { };
  }
}
