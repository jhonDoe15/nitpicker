package p;
public class R5 {
    private static final R5 INSTANCE = new R5();
    public R5() {}
    public static R5 getInstance(int which) { return INSTANCE; }
}
