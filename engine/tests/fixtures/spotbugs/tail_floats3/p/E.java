package p;

public class E {
    double fp, fadd, fcall, fconst, fmix, fnone, fconv, fp2;
    double get() { return 2.5; }
    void s1(double x) { fp = x; }
    void s1b(double x) { fp2 = x; }
    void s2(double x) { fadd += x; }
    void s3() { fcall = Math.random(); }
    void s4() { fconst = 1.0; }
    void s5(double x) { fmix = x; fmix = x * 2; }
    void s6(int i) { fconv = i; }
    boolean c1(double y) { return fp == y; }
    boolean c2(double y) { return fadd == y; }
    boolean c3(double y) { return fcall == y; }
    boolean c4(double y) { return fconst == y; }
    boolean c5(double y) { return fmix == y; }
    boolean c6(double y) { return fnone == y; }
    boolean c7(double y) { return fconv == y; }
    boolean c8() { return fp == fp2; }
    boolean c9(E o) { return fadd == o.fadd; }
    boolean c10() { return fp == 1.5; }
    boolean c11() { return fnone == 1.5; }
    boolean c12() { return fadd == 1.0; }
    boolean c13(double y) { return y * 2 == 1.0; }
    boolean c14(double y) { return y * 2 == 1.5; }
    boolean c15(double y) { return get() == y; }
    boolean c16(double y, double z) { return Math.max(y, z) == y; }
    boolean c17(double y) { double l = y; return l == y; }
    boolean c18(double y) { double l = y * 2; return l == y; }
    boolean c19(double y) { double l = Math.abs(y); return l == y; }
    boolean c20(double y) { return (double) (float) y == y; }
    boolean c21(float y) { return (double) y == 2.5; }
    boolean c22(int i, double y) { return (double) i == y; }
    boolean c23(double y) { return -y == y; }
    boolean c24(double y) { return y / 3 == y; }
    boolean c25(double y, double z) { return y - z == 0; }
}
