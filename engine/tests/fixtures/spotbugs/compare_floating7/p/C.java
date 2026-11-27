package p;
import java.util.*;
class H1 implements Comparator<Number> { // Number.doubleValue on locals
  public int compare(Number x, Number y) {
    if (x.doubleValue() > y.doubleValue()) return 1;
    if (x.doubleValue() < y.doubleValue()) return -1;
    return 0;
  }
}
class H2 implements Comparator<Object[]> { // doubleValue on array elems
  public int compare(Object[] x, Object[] y) {
    if (((Double) x[0]).doubleValue() > ((Double) y[0]).doubleValue()) return 1;
    if (((Double) x[0]).doubleValue() < ((Double) y[0]).doubleValue()) return -1;
    return 0;
  }
}
class H3 implements Comparator<Double> { // left is plain call, right is boxed local
  double g() { return 1; }
  public int compare(Double x, Double y) {
    if (g() > y) return 1;
    if (g() < y) return -1;
    return 0;
  }
}
class H4 implements Comparator<Double> { // left computed, right boxed local
  public int compare(Double x, Double y) {
    if (x + 1 > y) return 1;
    if (x + 1 < y) return -1;
    return 0;
  }
}
class H5 implements Comparator<Float> { // Float.floatValue and double widening
  public int compare(Float x, Float y) {
    if (x.doubleValue() > y.doubleValue()) return 1;
    if (x.doubleValue() < y.doubleValue()) return -1;
    return 0;
  }
}
class H6 implements Comparator<Integer> { // Integer.doubleValue
  public int compare(Integer x, Integer y) {
    if (x.doubleValue() > y.doubleValue()) return 1;
    if (x.doubleValue() < y.doubleValue()) return -1;
    return 0;
  }
}
class H7 implements Comparator<Double> { // unboxed twice into different locals
  public int compare(Double x, Double y) {
    double a = x, b = y;
    if (a > b) return 1;
    double c = x, d = y;
    if (c < d) return -1;
    return 0;
  }
}
class H8 implements Comparator<Double> { // x.compareTo-style getter method on local
  static class Box { double v; double get() { return v; } }
  public int compare(Double x, Double y) {
    Box a = new Box(), b = new Box();
    if (a.get() > b.get()) return 1;
    if (a.get() < b.get()) return -1;
    return 0;
  }
}
class H9 implements Comparator<double[]> { // lambda param locals vs this; right-hand constant
  public int compare(double[] x, double[] y) {
    if (x[0] > 1.5) return 1;
    if (x[0] < 1.5) return -1;
    return 0;
  }
}
class H10 implements Comparator<double[]> { // constants both
  public int compare(double[] x, double[] y) {
    double a = x[0];
    if (a > 1.5) return 1;
    if (a < 1.5) return -1;
    return 0;
  }
}
class H11 implements Comparator<double[]> { // a>b then a<2.0 (diff constants), and different consts
  public int compare(double[] x, double[] y) {
    double a = x[0];
    if (a > 1.5) return 1;
    if (a < 2.5) return -1;
    return 0;
  }
}
class H12 implements Comparator<double[]> { // 0 constants: 0.0 vs 0 int literal
  public int compare(double[] x, double[] y) {
    double a = x[0];
    if (a > 0) return 1;
    if (a < 0.0) return -1;
    return 0;
  }
}
class H13 implements Comparator<double[]> { // MAX_VALUE constants
  public int compare(double[] x, double[] y) {
    double a = x[0];
    if (a > Double.MAX_VALUE) return 1;
    if (a < Double.MAX_VALUE) return -1;
    return 0;
  }
}
class H14 implements Comparator<double[]> { // MAX_VALUE
  public int compare(double[] x, double[] y) {
    double a = x[0];
    if (a > Double.MAX_VALUE) return 1;
    if (a < Double.MAX_VALUE) return -1;
    return 0;
  }
}
class H15 implements Comparator<double[]> { // long vs double mix, int local widening
  public int compare(double[] x, double[] y) {
    long a = (long) x[0]; double b = y[0];
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  }
}
class H16 implements Comparator<double[]> { // conditions separated by other operations, ternary nested in args
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    return Math.max(a > b ? 1 : 0, 0) + Math.max(0, a < b ? 1 : 0);
  }
}
class H17 implements Comparator<double[]> { // while / do-while
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    int n = 0;
    while (a > b) { n++; a--; }
    do { n++; } while (a < b && n < 3);
    return n;
  }
}
class H18 implements Comparator<double[]> { // loop reuse: same pair in loop condition and body
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    for (int i = 0; a < b && i < 2; i++) { if (a < b) return 1; }
    return 0;
  }
}
