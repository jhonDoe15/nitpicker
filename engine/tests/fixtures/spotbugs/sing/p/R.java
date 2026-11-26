package p;
public class R {
    private static final Object INSTANCE = new R();
    public R() {}
    public static Object getInstance() { return INSTANCE; }
}
