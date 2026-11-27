package p;
public class T {
  public interface I2 { boolean m(); }
  public static class I2a implements I2 { public boolean m() { return false; } }
  public static class I2b implements I2 { public boolean m() { return true; } }
  public interface I3 { boolean m(); }
  public static class I3a implements I3 { public boolean m() { return false; } }
  public static class I3b implements I3 { public boolean m() { System.out.println(); return true; } }
  public interface I6 { boolean m(); }
  public static class I6a implements I6 { public boolean m() { return false; } }
  public static class I6b implements I6 { public boolean m() { return true; } }
  public static class I6c extends I6b { public boolean m() { return true; } }
  public static class C1 { int m() { return 1; } }
  public static class C2 extends C1 { int m() { return 2; } }
  public static class D1 { int m() { return 1; } }
  public static class D2 extends D1 { }
  public interface E { default int m() { return 0; } }
  public static class Ea implements E { public int m() { return 1; } }
  public static class Eb implements E { public int m() { return 2; } }
  public static abstract class F { abstract int m(); }
  public static class Fa extends F { int m() { return 1; } }
  public static class Fb extends F { int m() { return 2; } }
  public static class G1 { int m() { return 1; } }
  public static class G2 extends G1 { int m() { return 2; } }
  public static class G3 extends G1 { int m() { return 3; } }
  public static class H { public String toString() { return "h"; } public int hashCode() { return 1; } public boolean equals(Object o) { return false; } }
  void a(I2a i2a, I3 i3, I6 i6, C1 c1, C2 c2, D1 d1, D2 d2, E e, Ea ea, F f, Fa fa, G1 g1, H h, I6b i6b) {
    i2a.m();
    i3.m();
    i6.m();
    c1.m();
    c2.m();
    d1.m();
    d2.m();
    e.m();
    ea.m();
    f.m();
    fa.m();
    g1.m();
    h.toString();
    h.hashCode();
    h.equals(null);
    i6b.m();
  }
}
