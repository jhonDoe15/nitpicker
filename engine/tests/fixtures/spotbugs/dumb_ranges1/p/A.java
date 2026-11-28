package p;

public class A {
    static final int[] F = new int[4];
    private int[] g = {1, 2};

    int locals(int[] q, int n) {
        int[] a = new int[3];
        a[3] = 1;
        a[2] = 1;
        int b = a[7];
        int[] c = {1, 2, 3, 4};
        c[4] = 0;
        int[][] m = new int[2][5];
        m[2][0] = 1;
        m[0][5] = 1;
        q[-2] = 1;
        int d = q[-3];
        int[] e = new int[n];
        e[-1] = 0;
        String[] s = new String[1];
        s[1] = "x";
        long[] l = new long[0];
        l[0] = 1;
        return b + d + F[9] + g[5];
    }

    int reassigned(boolean f) {
        int[] a = new int[2];
        if (f) {
            a = new int[10];
        }
        a[5] = 1;
        int[] b = new int[2];
        b = new int[8];
        b[5] = 1;
        return a[0] + b[0];
    }

    void twice() {
        int[] a = new int[1];
        a[3] = 1;
        a[3] = 2;
        a[4] = 3;
    }

    void inc() {
        int[] a = new int[1];
        a[1]++;
        a[2] += 3;
        byte[] b = new byte[2];
        b[2] = 1;
        char[] c = new char[2];
        c[2] = 'a';
        Object[] o = new Object[2];
        o[2] = null;
        boolean[] z = new boolean[1];
        z[1] = true;
    }

    int constants() {
        final int size = 3;
        int[] a = new int[size];
        int i = 4;
        a[i] = 1;
        a[size] = 2;
        return a.length;
    }
}
