package p;
import static p.K.*;
import java.util.function.*;
public class A {
    double fa; double fb; static double sa; final double fin; final double fin2; final double fin3;
    A(double x) { fin = x; fin2 = x; fin3 = x; this.fa += 1.0; }
    A(double x, int y) { this(x); }
    A(String s, double x) { fin = x * 2; fin2 = 1.0 + x; fin3 = x; }
    boolean m1(double x) { return x == HALF; }
    boolean m2(double x) { return x == F; }
    boolean m3(float x) { return x == 0.1f; }
    boolean m4(double x) { return x == 0.1f; }
    boolean m5(float x) { return x == 0.1; }
    boolean m6(long l, double x) { return l == x; }
    boolean m7(char c, float x) { return c == x; }
    boolean m8(double x) { return fin == x; }
    boolean m9(double x) { return fin2 == x; }
    boolean m10(double x) { return fin3 == 0.3; }
    boolean m11(double x) { return fin2 == 0.3; }
    boolean m12(double x) { return fa == 0.3; }
    boolean m13(double x) { return x == dyn; }
    boolean m14(double x, double y) { return x == y; }
    boolean m15(double x, double y) { double t = x; return t == y; }
    boolean m16(double x, double y) { double t = x; while (y > 0) { t = t * 2; y--; } return t == 0.3; }
    boolean m17(double x, double y) { double t = x; for (int i = 0; i < 3; i++) { if (t == 0.3) return true; t = t + y; } return false; }
    boolean m18(boolean c, double x, double y) { return (c ? x : y * 2) == 0.3; }
    boolean m19(boolean c, double x, double y) { return (c ? x : y) == 0.3; }
    boolean m20(double x) { return x == (double) (float) 0.3; }
    boolean m21(double x) { return x == (int) 3.5; }
    boolean m22(double x) { return x == 3 / 2; }
    boolean m23(double x) { return x == 3 / 2.0; }
    boolean m24(double x) { return x == 1.0 / 0; }
    boolean m25(double x) { return x == 0.0 / 0; }
    boolean m26(double x) { return x != Double.NaN; }
    boolean m27(Double x) { return x == Double.NaN; }
    boolean m28(Double x, Double y) { return x == y; }
    boolean m29(Double x) { return x == 0.3; }
    boolean m30(Double x) { return x.doubleValue() == 0.3; }
    boolean m31(double x) { final double n = Double.NaN; return x == n; }
    boolean m32(double x) { double n = 0.0 / 0.0; return x == n; }
    boolean m33(double x) { double n = Double.NaN; n = 1; return x == n; }
    boolean m34(double x) { return x == Math.PI; }
    boolean m35(double x) { return x == Math.sqrt(2); }
    boolean m36(double x) { return x == -0.3; }
    boolean m37(double x) { return x == +0.3; }
    boolean m38(double x) { return x == (0.3); }
    boolean m39(double x) { return x == 0x1p-2; }
    boolean m40(double x) { return x == 1e300 * 1e300; }
    boolean m41(double x) { return x == 100L; }
    boolean m42(double x) { return x == Float.MIN_VALUE; }
    boolean m43(double x) { return x == Double.MIN_VALUE; }
    boolean m44(double x) { return x == Long.MAX_VALUE; }
    boolean m45(double x) { return x == 'a'; }
    boolean m46(double x) { return x == 1.0f / 3; }
    boolean m47(double x) { x += 1; return x == 0.3; }
    boolean m48(double x) { x++; return x == 0.3; }
    boolean m49(double x) { x = -x; return x == 0.3; }
    boolean m50(double x) { int i = 2; return x == i * 0.5; }
    Supplier<Boolean> m51(double x) { return () -> x == 0.3; }
    Supplier<Boolean> m52(double x) { return () -> x * 2 == 0.3; }
    Runnable m53(double x) { return new Runnable() { public void run() { boolean b = x == 0.3; } }; }
    boolean m54(double x) { return x == 0.3 || x == 0.4; }
    boolean m55(A o, double x) { return o.fa == x; }
    boolean m56(A o, A p) { return o.fa == p.fa; }
    boolean m57(A o) { return o.fa == this.fa; }
    boolean m58(A o) { return o.fb == this.fb; }
    boolean m59(double x) { return sa == x; }
    boolean m60(double x) { return A.sa == sa; }
    void m61(A o) { o.fb += 1.0; }
    void m62(A o) { o.fb++; }
    static { sa = 2.0 * Math.random(); }
}
