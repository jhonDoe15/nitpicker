package p;

public class E {
    boolean zf; int fi;
    boolean zc() { return zf; }
    boolean e1(Object v) {
        if (zf
            & v.hashCode() > 0) return true;
        return false;
    }
    boolean e2(Object v) {
        if (v.hashCode() > 0
            & zf) return true;
        return false;
    }
    boolean e3(Object v) {
        if (zc()
            & zc()) return true;
        return false;
    }
    boolean e4(Object v) {
        if (zf &
            v
            .hashCode() > 0) return true;
        return false;
    }
    boolean e5(Object v) {
        return zf
            & v.hashCode() > 0;
    }
    boolean e6(Object v, int i) {
        boolean r = zf; if (i > 0) fi = 2;
        if (zf
            & v.hashCode() > 0) return true;
        return false;
    }
}
