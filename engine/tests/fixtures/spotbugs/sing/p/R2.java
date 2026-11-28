package p;
public class R2 {
    private static final R2 INSTANCE = new R2();
    public R2() {}
    public static Object getInstance() { return INSTANCE; }
}
