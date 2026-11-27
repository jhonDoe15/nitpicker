package p;

public class A {
    double d; float f; double e2; static double S; double[] arr = new double[2];

    public boolean equals(Object o) { A a = (A) o; return d == a.d; }
    public int hashCode() { return 1; }
    boolean eq1(A a) { return d == a.d; }
    boolean eq2(A a) { return this.d == a.d && this.f == a.f; }
    boolean eq3() { return d == e2; }
    boolean eq4() { return d == S; }
    boolean eq5(double x, double y) { double a = x * 2; double b = y * 2; return a == b; }
    boolean eq6(A a) { return arr[0] == a.arr[0]; }
    boolean eq7(double x) { return x == 3.0; }
    boolean eq8(double x) { return x == 0.5; }
    boolean eq9(double x) { return x != 0.0; }
    boolean eq10(A a) { return Double.compare(d, a.d) == 0; }
    boolean eq11(double x) { double y = x; return y == d; }
    boolean eq12(A a) { return get() == a.get(); }
    boolean eq13(double x, double y) { return x + 1 == y; }
    boolean eq14(double x, double y) { return x * y == 0.0; }
    boolean eq15(double x) { return x == 10.0; }
    boolean eq16(double x) { return x == 100.0; }
    boolean eq17(double x) { return x == Double.MAX_VALUE; }
    boolean eq18(float x) { return x == Float.NaN; }
    boolean eq19(double x) { return Double.NaN != x; }
    boolean eq20(double x) { return x == 0.0 / 0.0; }
    boolean eq21(A a) { return d != a.d; }
    boolean eq22(A a, A b) { return a.d == b.d; }
    double get() { return d; }
    boolean eq23(double x) { return x == -0.0; }
    boolean eq24(double x) { return x == 1e10; }
    boolean eq25(double x) { return x == 4.0; }
    boolean eq26(double x) { return x == 0.25; }
    boolean eq27(float x) { return x == 3f; }
    boolean eq28(double x) { return x == Float.NaN; }
}
