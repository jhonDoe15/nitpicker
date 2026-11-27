package p;
public class A {
    double fa; static final double K = 0.1 + 0.2;
    boolean a1(double x) { int i = 2; return x == i * 0.5; }
    boolean a2(double x) { int i = 3; return x == i * 0.5; }
    boolean a3(double x) { double c = 2.0; return x == c * 0.5; }
    boolean a4(double x) { double c = 2.0; return x == c * 0.3; }
    boolean a5(double x) { long l = 2; return x == l * 0.5; }
    boolean a6(double x) { final int i = 2; return x == i * 0.5; }
    boolean a7() { return fa == 0.1 + 0.2; }
    boolean a8() { return fa == K; }
    boolean a9() { return fa == 0.0 / 0; }
    boolean b1(double x) { int i = 2; return x == i + 0.5; }
    boolean b2(double x) { float f = 2; return x == f * 0.5f; }
    boolean b3(double x) { int i = 2; i = i + 1; return x == i * 0.5; }
    boolean b4(double x, boolean c) { int i = c ? 2 : 4; return x == i * 0.5; }
    boolean b5(double x) { int i = 2; return i * 0.5 == x; }
    boolean b6(double x) { int i = 2; return x == (double) i; }
    boolean b7(double x) { int i = 2; return x == i * 1.0; }
    boolean b8(double x) { int i = 2; return x == 0.5 * i * 3; }
}
