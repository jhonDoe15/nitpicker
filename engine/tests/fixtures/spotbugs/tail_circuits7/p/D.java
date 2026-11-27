package p;

public class D {
    boolean zf; int fi; Object o2;
    boolean d1(Object v, Object w) {
        if (v != null & v.hashCode() > 0) fi = 1;
        if (w != null & w.hashCode() > 0) fi = 2;
        return true;
    }
    boolean d2(Object v, Object w) {
        if (v != null & v.hashCode() > 0) fi = 1;
        if (zf & w.hashCode() > 0) fi = 2;
        if (zf & w.hashCode() > 1) fi = 3;
        return true;
    }
    boolean d3(Object v, int i) {
        if (i > 0 & i < 4) fi = 1;
        if (zf & v.hashCode() > 0) fi = 2;
        return true;
    }
    boolean d4(Object v, Object w) {
        return (v != null & v.hashCode() > 0) == (w != null & w.hashCode() > 0);
    }
    boolean d5(Object v, int i) { if (v != null & v.hashCode() > 0 & i > 0) return true; return false; }
    boolean d6(Object v, int i) {
        if (v != null
            & v.hashCode() > 0) return true;
        return false;
    }
}
