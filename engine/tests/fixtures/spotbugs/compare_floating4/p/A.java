package p;
import java.util.*;
class V { double v; double u; int i; }
class D1 implements Comparator<V> { public int compare(V a, V b) { if (a.v > b.v || a.v > b.v) return 1; return 0; } }
class D2 implements Comparator<V> { public int compare(V a, V b) { if (a.v > b.v) return 1; if (!(a.v <= b.v)) return 2; return 0; } }
class D3 implements Comparator<V> { public int compare(V a, V b) { if (a.v > b.v) return 1; boolean g = !(a.v > b.v); return g ? 0 : 1; } }
class L1 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) return 1;
        if (a.v > b.v) return 2;
        if (a.v < b.v) return -1;
        if (a.v >= b.v) return 3;
        if (a.v <= b.v) return 4;
        return 0;
    }
}
class L2 implements Comparator<V> {
    public int compare(V a, V b) {
        if (a.v > b.v) return 1;
        if (a.v < b.v) return 2;
        if (a.v == b.v) return 3;
        if (a.u > b.u) return 1;
        if (a.v > b.v) return 1;
        if (a.u < b.u) return 2;
        return 0;
    }
}
class K1 implements Comparable<K1> {
    double v; int i;
    public int compare(K1 a, K1 b) { if (a.i == 0) return Integer.MIN_VALUE; return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; }
    public int compareTo(K1 o) { return 0; }
    public int compareTo(K1 o, int k) { if (k == 0) return Integer.MIN_VALUE; return v > o.v ? 1 : v < o.v ? -1 : 0; }
}
class K2 implements Comparator<V> {
    public int compare(V a, V b) { return 0; }
    public static int compare(double x, double y) { if (x == 1) return Integer.MIN_VALUE; return x > y ? 1 : x < y ? -1 : 0; }
    public long compare(V a) { return a.v > a.u ? 1 : a.v < a.u ? -1 : 0; }
    public int compareTo(V a, V b) { if (a.i == 0) return Integer.MIN_VALUE; return 0; }
}
abstract class K3 implements Comparator<V> {
    public int compare(V a, V b) { if (a.i == 0) return Integer.MIN_VALUE; return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; }
}
class K4 implements Comparator<V> {
    Comparator<V> inner = new Comparator<V>() { public int compare(V a, V b) { if (a.i == 0) return Integer.MIN_VALUE; return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; } };
    public int compare(V a, V b) { return 0; }
}
interface K5 extends Comparator<V> {
    default int compare(V a, V b) { if (a.i == 0) return Integer.MIN_VALUE; return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; }
}
enum K6 implements Comparator<V> { X;
    public int compare(V a, V b) { if (a.i == 0) return Integer.MIN_VALUE; return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; }
}
class K7 extends K3 {
    public int compare(V a, V b) { if (a.i == 0) return Integer.MIN_VALUE; return a.v > b.v ? 1 : a.v < b.v ? -1 : 0; }
}
class K8 implements Comparable<Object> {
    double v;
    public int compareTo(Object o) { if (o == null) return Integer.MIN_VALUE; K8 k = (K8) o; return v > k.v ? 1 : v < k.v ? -1 : 0; }
}
