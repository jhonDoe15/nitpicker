package p;
import java.util.*;
class J1 implements Comparator<double[]> { // call left, local right
  double g() { return 1; }
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (g() > b) return 1;
    if (g() < b) return -1;
    return 0;
  }
}
class J2 implements Comparator<double[]> { // call left, field right
  double g() { return 1; } double f;
  public int compare(double[] x, double[] y) {
    if (g() > f) return 1;
    if (g() < f) return -1;
    return 0;
  }
}
class J3 implements Comparator<double[]> { // computed left, local right
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (x[0] + 1 > b) return 1;
    if (x[0] + 1 < b) return -1;
    return 0;
  }
}
class J4 implements Comparator<double[]> { // call left, call right of different methods
  double g() { return 1; } double h() { return 1; }
  public int compare(double[] x, double[] y) {
    if (g() > h()) return 1;
    if (g() < h()) return -1;
    return 0;
  }
}
class J5 implements Comparator<double[]> { // call left, constant right
  double g() { return 1; }
  public int compare(double[] x, double[] y) {
    if (g() > 2.0) return 1;
    if (g() < 2.0) return -1;
    return 0;
  }
}
class J6 implements Comparator<double[]> { // computed left, computed right
  public int compare(double[] x, double[] y) {
    if (x[0] > y[0]) return 1;
    if (x[0] < y[0]) return -1;
    return 0;
  }
}
class J7 implements Comparator<double[]> { // computed left, constant right
  public int compare(double[] x, double[] y) {
    if (x[0] > 2.0) return 1;
    if (x[0] < 2.0) return -1;
    return 0;
  }
}
class J8 implements Comparator<double[]> { // constant left, local right
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (2.0 > b) return 1;
    if (2.0 < b) return -1;
    return 0;
  }
}
class J9 implements Comparator<double[]> { // int literal 0 both ways
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (b > 0) return 1;
    if (b < 0) return -1;
    return 0;
  }
}
class J10 implements Comparator<double[]> { // 1 vs 1.0, 
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (b > 1) return 1;
    if (b < 1.0) return -1;
    return 0;
  }
}
class J11 implements Comparator<float[]> { // float 0f vs 0
  public int compare(float[] x, float[] y) {
    float b = y[0];
    if (b > 0f) return 1;
    if (b < 0) return -1;
    return 0;
  }
}
class J12 implements Comparator<double[]> { // static final constant vs literal
  static final double K = 2.0;
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (b > K) return 1;
    if (b < 2.0) return -1;
    return 0;
  }
}
class J13 implements Comparator<double[]> { // 2.0 vs 2.0f?
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (b > 2.0f) return 1;
    if (b < 2.0) return -1;
    return 0;
  }
}
class J14 implements Comparator<double[]> { // -0.0 vs 0.0
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (b > 0.0) return 1;
    if (b < -0.0) return -1;
    return 0;
  }
}
class J15 implements Comparator<double[]> { // static field vs this field of same name other cls
  static double S; double f; J15 o;
  public int compare(double[] x, double[] y) {
    if (o.f > f) return 1;
    if (o.f < f) return -1;
    return 0;
  }
}
class J16 implements Comparator<J16> { // fields of different objects same field: a.f vs b.f then different locals
  double f;
  public int compare(J16 a, J16 b) {
    if (a.f > 0.5) return 1;
    if (b.f < 0.5) return -1;
    return 0;
  }
}
