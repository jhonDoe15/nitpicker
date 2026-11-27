package p;

public class R {
    static final int[] SF = new int[4];
    private static int[] SN = new int[4];
    final int[] IF = new int[4];
    private int[] IN = new int[4];
    int[] IR = new int[4];
    int[] IW = new int[4];
    final int[] IC;
    static final int[] SM;
    static final int[] Z = new int[0];
    static final int[] E0 = {};
    int[] q;
    boolean f;

    static {
        SM = new int[4];
    }

    R() {
        IC = new int[4];
    }

    void reset() {
        IR = new int[10];
    }

    static int va(int... x) {
        return x[2];
    }

    int sf() {
        return SF[4];
    }

    int sn() {
        return SN[4];
    }

    int inf() {
        return IF[4];
    }

    int inn() {
        return IN[4];
    }

    int inr() {
        return IR[4];
    }

    int ctor() {
        return IC[4];
    }

    int arr2() {
        int[] a = {1}; return a[a.length];
    }

    int len() {
        int[] a = new int[3]; int i = a.length; return a[i];
    }

    int expr() {
        int[] a = new int[3]; return a[1 + 2];
    }

    int sizeexpr() {
        int[] a = new int[1 + 2]; return a[3];
    }

    int copy() {
        int[] a = new int[3]; int[] b = a; return b[3];
    }

    int cloned() {
        int[] a = new int[3]; return a.clone()[3];
    }

    int tern() {
        int[] a = f ? new int[2] : new int[2]; return a[3];
    }

    int loop() {
        int[] a = new int[2]; for (int k = 0; k < 2; k++) { a = new int[5]; } return a[3];
    }

    int inloop() {
        int[] a = new int[2]; int s = 0; for (int k = 0; k < 2; k++) { s += a[3]; } return s;
    }

    int lam() {
        java.util.function.IntSupplier s = () -> { int[] a = new int[2]; return a[2]; }; return s.getAsInt();
    }

    int newidx() {
        return new int[2][2][2].length;
    }

    int direct() {
        return new int[2][3].length;
    }

    int init2() {
        return new int[] {1, 2}[2];
    }

    int charidx() {
        int[] a = new int[3]; return a['a'];
    }

    int longarr() {
        int[] a = new int[3]; long i = 3; return a[(int) i];
    }

    int shortidx() {
        int[] a = new int[3]; short i = 3; return a[i];
    }

    int neg() {
        int[] a = new int[3]; int i = -1; return a[i];
    }

    int minval() {
        return q[Integer.MIN_VALUE];
    }

    int big() {
        int[] a = new int[3]; return a[1000000];
    }

    int tryc() {
        int[] a = new int[2]; try { a = new int[9]; } catch (RuntimeException e) { } return a[3];
    }

    int param() {
        q = new int[2]; return q[2];
    }

    int fieldw() {
        IW = new int[9]; return IW[3];
    }

    int sfm() {
        return SM[4];
    }

    int outer() {
        return Other.O[4];
    }

    int zero() {
        return Z[0];
    }

    int empty() {
        return E0[0];
    }

    int size0() {
        int n = 0; int[] a = new int[n]; return a[0];
    }

    int objarr() {
        Object[] a = new Object[2]; return a[2].hashCode();
    }

    int str() {
        String[] a = {"x"}; return a[1].length();
    }

    int varg() {
        return va(1, 2);
    }

    int switchv() {
        int[] a = new int[2]; switch (q.length) { case 1: a = new int[5]; break; default: } return a[3];
    }

    int ifelse() {
        int[] a; if (f) { a = new int[2]; } else { a = new int[2]; } return a[3];
    }

    int cond() {
        int[] a = new int[2]; return f ? a[3] : 0;
    }

    int deadif() {
        int[] a = new int[2]; if (false) { return a[3]; } return 0;
    }

    int twodim() {
        int[][] a = new int[3][]; return a[3].length;
    }

    int store() {
        int[] a = new int[2]; a[2] = 5; return 0;
    }

}

class Other {
    static final int[] O = new int[4];
}
