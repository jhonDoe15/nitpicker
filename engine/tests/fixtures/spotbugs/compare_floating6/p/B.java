package p;
import java.util.*;
class G1 implements Comparator<Double> { // boxed from fields / calls
  Double fa, fb;
  public int compare(Double x, Double y) {
    if (fa > fb) return 1;
    if (fa < fb) return -1;
    return 0;
  }
}
class G2 implements Comparator<Double> { // mixed: boxed first, primitive second
  public int compare(Double x, Double y) {
    double d = y;
    if (x > d) return 1;
    if (x < d) return -1;
    return 0;
  }
}
class G3 implements Comparator<Double> { // unboxed via method
  public int compare(Double x, Double y) {
    if (x.doubleValue() > y.doubleValue()) return 1;
    if (x.doubleValue() < y.doubleValue()) return -1;
    return 0;
  }
}
class G4 implements Comparator<Double> { // boxed vs constant
  public int compare(Double x, Double y) {
    if (x > 0.0) return 1;
    if (x < 0.0) return -1;
    return 0;
  }
}
class G5 implements Comparator<Object[]> { // boxed from array
  public int compare(Object[] x, Object[] y) {
    if ((Double) x[0] > (Double) y[0]) return 1;
    if ((Double) x[0] < (Double) y[0]) return -1;
    return 0;
  }
}
class G6 implements Comparator<double[]> { // static field, other-object field
  static double S; double f; G6 other;
  public int compare(double[] x, double[] y) {
    if (S > other.f) return 1;
    if (S < other.f) return -1;
    return 0;
  }
}
class G7 implements Comparator<double[]> { // left local right field
  double f;
  public int compare(double[] x, double[] y) {
    double a = x[0];
    if (a > f) return 1;
    if (a < f) return -1;
    return 0;
  }
}
class G8 implements Comparator<double[]> { // left computed, right local
  public int compare(double[] x, double[] y) {
    double b = y[0];
    if (x[0] > b) return 1;
    if (x[0] < b) return -1;
    return 0;
  }
}
class G9 implements Comparator<double[]> { // different order b>a, a<b not a pair; plus a>b twice
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    if (a > b) return 1;
    if (b > a) return -1;
    return 0;
  }
}
class G10 implements Comparator<double[]> { // a>b twice
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    if (a > b) return 1;
    if (a > b) return -1;
    return 0;
  }
}
class G11 implements Comparator<double[]> { // three comparisons
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    if (a > b) return 1;
    if (a < b) return -1;
    if (a > b) return 2;
    return 0;
  }
}
class G12 implements Comparator<float[]> { // float with double mixing
  public int compare(float[] x, float[] y) {
    double a = x[0]; float b = y[0];
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  }
}
class G13 implements Comparator<double[]> { // stack depth: in arg to call
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    int r = Integer.valueOf(1) + (a > b ? 1 : 0);
    int s = (a < b ? 1 : 0) + r;
    return s;
  }
}
class G14 implements Comparator<double[]> { // first operand of + ok
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    int r = (a > b ? 1 : 0) + (a < b ? 1 : 0);
    return r;
  }
}
class G15 implements Comparator<double[]> { // in static call args: first arg
  static int f(int q, int r) { return q + r; }
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    return f(a > b ? 1 : 0, a < b ? 1 : 0);
  }
}
class G16 implements Comparator<double[]> { // array store, compound assign
  int[] arr = new int[2]; int fld;
  public int compare(double[] x, double[] y) {
    double a = x[0], b = y[0];
    arr[0] = a > b ? 1 : 0;
    arr[1] = a < b ? 1 : 0;
    fld = a > b ? 1 : 0;
    fld = a < b ? 1 : 0;
    return 0;
  }
}
