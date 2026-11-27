package p;

import java.util.function.DoubleBinaryOperator;

public class G {
    final double two; final double one;
    double viaOther; public double pub;
    static double st;
    G(double x) { two = x; one = x; }
    G() { two = 1.5; one = Math.abs(1); }
    double half(double y) { return y / 2; }
    boolean b1(double y) { return two == y; }
    boolean b2(double y) { return one == y; }
    boolean b3(double y) { return half(y) == y; }
    boolean b4(int i, double y) { return (double) (i * 2) == y; }
    boolean b5(float f, double y) { return (double) (f * 2) == y; }
    boolean b6(double y, double z) {
        if (y == z) { return true; }
        return y * 2 == z;
    }
    boolean b7(double y, double z) {
        if (y * 2 == z) { return true; }
        return n() == z;
    }
    boolean b8(double y, double z) {
        boolean a = n() == z;
        boolean b = n() == 1.5;
        return a && b;
    }
    boolean b9(double y) { return y == -y; }
    boolean b10(double y) { return -y == -y; }
    boolean b11(double y, double z) { double w = y; w = z; return w == y; }
    boolean b12(double y, boolean c) { double w = c ? y : y * 2; return w == y; }
    boolean b13(double y, boolean c, double z) { double w = c ? y : z; return w == y; }
    boolean b14(double y) { return viaOther == y; }
    boolean b15(double y) { return pub == y; }
    boolean b16(double y) { return st == y; }
    DoubleBinaryOperator lam() { return (a, b) -> a * 2 == b ? 1 : 0; }
    double n() { return 3; }
    boolean b17(float a, float b) { return a * b == b; }
    boolean b18(float a) { return a == 1.5f; }
    boolean b19(float a) { return a == 0.1f; }
    boolean b20(double y) { return y == 0.1f; }
    boolean b21(double y) { double z = y; return z == z; }
    boolean b22(double y) { return y != y; }
    boolean b23(double[] a) { return a[0] == a[0]; }
    boolean b24() { return n() == n(); }
}
