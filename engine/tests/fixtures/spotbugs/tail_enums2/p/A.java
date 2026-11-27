package p;

public enum A {
    X, Y;
    public int unwritten;
    public int written;
    public int initialized = 3;
    public String s;
    protected int prot;
    public volatile int vol;
    public transient int tr;
    public static String st;

    A() { written = 1; }

    public void
        setS(
            String v) {
        System.out.println(v);
        s = v;
    }
    public void cond(String v) {
        if (v == null) {
            return;
        }
        s = v;
    }
    public void afterLoop(String v) {
        for (int i = 0; i < 2; i++) { System.out.println(i); }
        s = v;
    }
    public void tryIt(String v) {
        try { s = v; } finally { System.out.println(); }
    }
    public void sync(String v) {
        synchronized (this) { s = v; }
    }
    public void twice(String v) { s = v; s = v + "x"; }
    public void local(String v) { String w = v; s = w; }
    public void constant() { s = "c"; }
    public void computed(int v) { prot = v + 1; }
    public void other(A a, int v) { a.prot = v; }
    public final void fin(int v) { prot = v; }
    public synchronized void syn(int v) { vol = v; }
    public void lam(int v) { Runnable r = () -> prot = v; r.run(); }
    public void thr(int v) { if (v < 0) throw new IllegalArgumentException(); prot = v; }
    public void ternary(boolean b, int v) { prot = b ? v : 0; }
    public void assertIt(int v) { assert v > 0; prot = v; }
    @Deprecated public void ann(int v) { tr = v; }
    public void varargs(String... v) { s = v[0]; }
}
