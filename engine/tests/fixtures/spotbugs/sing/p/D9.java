package p;
public abstract class D9 {
    private static final D9 INSTANCE = make();
    public D9() {}
    static D9 make() { return null; }
    public static D9 get() { return INSTANCE; }
}
