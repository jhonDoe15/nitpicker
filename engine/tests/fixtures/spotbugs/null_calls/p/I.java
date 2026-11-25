package p;
public interface I {
    @Nullable X inul();
    @Nullable default X dnul() { return null; }
    static void sderef(X x) { x.foo(); }
    default void idef(X x) { x.foo(); }
}
