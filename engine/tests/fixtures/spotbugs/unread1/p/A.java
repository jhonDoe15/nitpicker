package p;

import java.io.Serializable;

public class A {
    private int a;
    int b;
    protected int c;
    public int d;
    private final int e = 3;
    private final int f;
    private static int g;
    public static int h;
    private int i = 1;
    private int j;
    private Object k;
    private transient int l;
    private volatile int m;
    private int n;
    private int o;
    private final String p;
    private int q;
    public final int r;
    private int s;
    private int t;

    A(int x) {
        a = x;
        b = x;
        c = x;
        d = x;
        f = x;
        g = x;
        h = x;
        k = new Object();
        l = x;
        m = x;
        n = x;
        n++;
        o = x;
        o += 1;
        p = "s" + x;
        q = x;
        r = x;
        s = x;
        t = x;
    }

    void use(A other) {
        j = 2;
        other.q = 5;
        int z = other.s;
        this.t = this.t;
    }
}
