package p;
public class T {
  public interface J { int only(); }
  public static class JI implements J { public int only() { return 1; } }
  public interface K { int only(); }
  public static class KI implements K { public int only() { return 1; } }
  public static class KI2 implements K { public int only() { return 2; } }
  public static abstract class F { abstract int m(); }
  public static class Fa extends F { int m() { return 1; } }
  public static class G { int m() { return 1; } }
  public static class G2 extends G { int m() { return 2; } }
  public static class H { int m() { return 1; } }
  public static class H2 extends H { }
  public static class H3 extends H2 { int m() { return 3; } }
  public interface L { int m(); }
  public static class LI implements L { public int m() { return 1; } }
  public static class LI2 extends LI { }
  public interface M { int m(); }
  public static abstract class MA implements M { }
  public static class MI extends MA { public int m() { return 1; } }
  public static class MI2 extends MA { public int m() { return 1; } }
  void a(J j, JI ji, K k, KI ki, F f, Fa fa, G g, G2 g2, H h, H2 h2, L l, LI li, LI2 li2, M m, MA ma, MI mi) {
    j.only();
    ji.only();
    k.only();
    ki.only();
    f.m();
    fa.m();
    g.m();
    g2.m();
    h.m();
    h2.m();
    l.m();
    li.m();
    li2.m();
    m.m();
    ma.m();
    mi.m();
  }
}
