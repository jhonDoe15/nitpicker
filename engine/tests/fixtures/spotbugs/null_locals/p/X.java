package p;
public class X {
    public int f;
    public X next;
    @Nullable public X nf;
    public int foo() { return 1; }
    @Nullable public X nul() { return next; }
    public X plain() { return next; }
    @Nullable public static X snul() { return null; }
    @Nullable public Integer boxed() { return null; }
    @Nullable public int[] arr() { return null; }
    @Nullable public String str() { return null; }
    public static void use(Object o) { }
    public static void deref(X x) { x.foo(); }
    public static void derefLater(X x, boolean c) { if (c) { use(null); } x.foo(); }
    public static void derefMaybe(X x, boolean c) { if (c) { x.foo(); } }
    public static void derefChecked(X x) { if (x != null) x.foo(); }
    public void ideref(X x) { x.foo(); }
    private void pderef(X x) { x.foo(); }
    public void callp(X y) { pderef(y.nul()); }
}
