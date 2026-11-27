package p;

public class F {
    boolean zf; int fi; int[] arr = {1};
    boolean zc() { return zf; }
    boolean f1(Object v) {
        if (v != null
            & v.hashCode() > 0) return true;
        return false;
    }
    boolean f2(int i) {
        if (i > 0
            & arr[i] > 0) return true;
        return false;
    }
    boolean f3(int i) {
        if (i > 0
            & i < 5) return true;
        return false;
    }
    boolean f4(int i) {
        if (zf
            & i < 5) return true;
        return false;
    }
    boolean f5(int i) {
        if (zf &
            i < 5
            & zc()) return true;
        return false;
    }
    boolean f6(Object v) {
        fi = 1;
        if (v != null
            & v
              .hashCode() > 0) return true;
        return false;
    }
    boolean f7(Object v) {
        boolean r =
            v != null;
        if (zf
            & v.hashCode() > 0) return r;
        return false;
    }
}
