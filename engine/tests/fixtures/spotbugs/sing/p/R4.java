package p;
public class R4 extends Base4 {
    private static final R4 INSTANCE = new R4();
    public R4() {}
    public static Base4 getInstance() { return INSTANCE; }
}
class Base4 {}
