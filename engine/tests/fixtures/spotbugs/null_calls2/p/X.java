package p;
public class X implements I {
    public int f;
    public X next;
    @Nullable public X nf;
    public int foo() { return 1; }
    @Nullable public X nul() { return next; }
    public X plain() { return next; }
    @Nullable public X inul() { return next; }
    public X onul() { return next; }
    public static void use(Object o) { }
    public static void use(boolean o) { }
    public static void deref(X x) { x.foo(); }
    public static void d2(X x) { deref(x); }
    public static void d3(X x) { d2(x); }
    public static void dField(X x) { use(x.f); }
    public static void dLoop(X x) { for (int i = 0; i < 3; i++) { x.foo(); } }
    public static void dWhile(X x, boolean c) { while (c) { x.foo(); } }
    public static void dTry(X x) { try { x.foo(); } finally { use(null); } }
    public static void dTryCatch(X x) { try { use(null); } catch (RuntimeException e) { return; } x.foo(); }
    public static void dThrow(X x, boolean c) { if (c) throw new IllegalStateException(); x.foo(); }
    public static void dReassign(X x) { x = new X(); x.foo(); }
    public static void dBoth(X x, boolean c) { if (c) { x.foo(); } else { use(x.f); } }
    public static void dSecond(int a, X x) { x.foo(); }
    public static void dReq(X x) { java.util.Objects.requireNonNull(x); }
    public static void dCheckThenDeref(X x) { if (x == null) { use(null); } x.foo(); }
    public static void dSync(X x) { synchronized (x) { use(null); } }
    public void virt(X x) { x.foo(); }
    public final void fin(X x) { x.foo(); }
    private void priv(X x) { x.foo(); }
    public void callPriv(X y) { priv(y.nul()); }
    public X(X x) { x.foo(); }
    public X() { }
    public void viaLambda(X x) { Runnable r = () -> x.foo(); r.run(); }
    public static void dTernary(X x, boolean c) { int k = c ? 1 : 2; x.foo(); }
    public static void dAssert(X x) { assert x != null; x.foo(); }
}
