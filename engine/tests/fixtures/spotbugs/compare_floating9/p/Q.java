package p;
import java.util.*;
abstract class Base implements Comparator<double[]> { }
class Q1 extends Base { public int compare(double[] x, double[] y) { double a=x[0], b=y[0]; if (a > b) return 1; if (a < b) return -1; return 0; } }
interface Q2 extends Comparator<double[]> {
  default int compare(double[] x, double[] y) { double a=x[0], b=y[0]; if (a > b) return 1; if (a < b) return -1; return 0; }
}
record Q3(double v) implements Comparable<Q3> {
  public int compareTo(Q3 o) { if (v > o.v) return 1; if (v < o.v) return -1; return 0; }
}
enum Q4 implements Comparator<double[]> { I;
  public int compare(double[] x, double[] y) { double a=x[0], b=y[0]; if (a > b) return 1; if (a < b) return -1; return 0; }
}
class Q5 implements Comparator<double[]> { // anonymous class inside compare
  public int compare(double[] x, double[] y) {
    Comparator<double[]> c = new Comparator<double[]>() {
      public int compare(double[] p, double[] q) { double a=p[0], b=q[0]; if (a > b) return 1; if (a < b) return -1; return 0; } };
    return c.compare(x, y);
  }
}
class Q6<T extends Number> implements Comparator<T> { // generic: doubleValue()
  public int compare(T x, T y) { if (x.doubleValue() > y.doubleValue()) return 1; if (x.doubleValue() < y.doubleValue()) return -1; return 0; }
}
class Q7 implements Comparable<Q7> { // compareTo with long cast & float
  float w;
  public int compareTo(Q7 o) { if (w > o.w) return 1; if (w < o.w) return -1; return 0; }
  public int compareTo(Q7 o, int z) { return 0; }
}
class Q8 implements Comparator<double[]> { // Double.compare-free: static method named compare(not reported); nested ternary
  public int compare(double[] x, double[] y) { double a=x[0], b=y[0]; return a > b ? 1 : (a < b ? -1 : (a > b ? 2 : 0)); }
}
class Q9 implements Comparator<double[]> { // switch expression
  public int compare(double[] x, double[] y) { double a=x[0], b=y[0]; int r = switch ((int) a) { case 0 -> a > b ? 1 : 0; default -> a < b ? 1 : 0; }; return r; }
}
class Q10 implements Comparator<double[]> { // labeled break & synchronized
  public int compare(double[] x, double[] y) { double a=x[0], b=y[0]; out: { if (a > b) break out; if (a < b) return -1; } synchronized (this) { if (a > b) return 4; } return 0; }
}
class Q11 implements Comparator<double[]> { public int compare(double[] x, double[] y) { return 0; }
  public int compare(double[] x, double[] y, int z) { double a=x[0], b=y[0]; if (a > b) return 1; if (a < b) return -1; return 0; }
}
class Q12 implements Comparator<double[]> { // x += stack depth ; field store through other object
  int tot; Q12 o;
  public int compare(double[] x, double[] y) { double a=x[0], b=y[0]; o.tot += a > b ? 1 : 0; o.tot += a < b ? 1 : 0; return 0; }
}
class Q13 implements Comparator<double[]> { // concatenation / left of +
  public int compare(double[] x, double[] y) { double a=x[0], b=y[0]; String s = "x" + (a > b) + (a < b); return s.length(); }
}
class Q14 implements Comparator<double[]> { // instance call receiver arguments
  public int compare(double[] x, double[] y) { double a=x[0], b=y[0]; StringBuilder sb = new StringBuilder(); sb.append(a > b).append(a < b); return sb.length(); }
}
