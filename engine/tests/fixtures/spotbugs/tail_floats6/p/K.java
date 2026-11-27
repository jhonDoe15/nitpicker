package p;

public class K {
    public double pubm; protected double protm; private double privm; double pkgm; public final double pubfin;
    final double mixed; double plain; static double sm; public static double psm;
    K(double x, boolean c) { pubm = x * 2; protm = x * 2; privm = x * 2; pkgm = x * 2; pubfin = x * 2; mixed = c ? x : 1.5; psm = x * 2; }
    boolean t1(double y, double z) {
        if (y * 2 == z) return true;
        return y * 3 == z;
    }
    boolean t2(double y) { double r = y / 3; return r != r; }
    boolean t3(double y) { return y * 2 == y * 2; }
    boolean t4(double y) { return pubm == y; }
    boolean t5(double y) { return protm == y; }
    boolean t6(double y) { return privm == y; }
    boolean t7(double y) { return pkgm == y; }
    boolean t8(double y) { return pubfin == y; }
    boolean t9() { double k = 1.5; return k == plain; }
    boolean t10() { return mixed == 1.5; }
    boolean t11(double y) { double l = Math.abs(y); return l == 1.5; }
    boolean t12(double y, boolean c) { double w = c ? 1.5 : y; return w == plain; }
    boolean t13(double y) { return (double) (y * 2) == y; }
    boolean t14(double y) { return (float) (y * 2) == 1.5f; }
    boolean t15(double y) { double d = y; d += 0.5; return d == y; }
    boolean t16(double y) { return Math.abs(y * 2) == y; }
    boolean t17(double y) { return y * 2 == Double.NaN; }
    boolean t18(double y) { return y == Double.NaN || y * 2 == 1.5; }
    boolean t19(double y) { return y == Double.NaN || y == Float.NaN; }
    boolean t20(double y) { return sm == y; }
    boolean t21(double y) { return psm == y; }
    boolean t22(double y) { double r = y * 2; return r == r; }
    boolean t23(double y) { for (double d = 0; d < 5; d++) { if (d == y) return true; } return false; }
    boolean t24(double y) { double d = y; while (d < 5) { if (d == y) return true; d = d * 2; } return false; }
    boolean t25(double y) { double d = y * 2; d = y; return d == y; }
    boolean t26(double y) { return plain * 2 == 3; }
    boolean t27(double y) { return y * 2 == plain; }
    boolean t28(double y) { return y + 0.5 == plain; }
    boolean t29(double y) { return plain == 1.5 || y * 2 == y; }
    boolean t30(double y) { return y * 2 == y || plain == 1.5; }
}
