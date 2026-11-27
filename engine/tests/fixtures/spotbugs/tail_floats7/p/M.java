package p;

public class M {
    public final double pubp; final double viaLocal; final double fromP; double m;
    static final double SC = 1.5;
    M(double x, double y) { pubp = x; double l = x; viaLocal = l; fromP = y; }
    void s(double x) { m = x * 2; }
    boolean u1() { return pubp == 1.5; }
    boolean u2() { return viaLocal == 1.5; }
    boolean u3() { return fromP == 1.5; }
    boolean u4(double y) { return -y == 1.5; }
    boolean u5(Double y) { return y == 1.5; }
    boolean u6(double y) { y = y + 0; return y == 1.5; }
    boolean u7(double y, boolean c) { if (c) y = Math.abs(y); return y == 1.5; }
    boolean u8(double y) { double k = Double.NaN; return y == k; }
    boolean u9() { return m == m; }
    boolean u10(M o) { return m == o.m; }
    boolean u11(float f, double y) { float g = f * 2; return g == y; }
    boolean u12(double y) { return y == SC; }
    boolean u13() { return m == SC; }
    boolean u14(double y, double z) { y = z; return y == 1.5; }
    boolean u15(double y) { double a = y * 2; double b = a; return a == b; }
    boolean u16(M o) { return o.fromP == 1.5; }
    boolean u17(Double y) { return y.doubleValue() == 1.5; }
    boolean u18(double y) { return y * 2 != 1.5; }
}
