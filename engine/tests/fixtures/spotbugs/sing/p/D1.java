package p;
public class D1 implements Cloneable {
    private static final D1 INSTANCE = new D1();
    private D1() {}
    public static D1 getInstance() { return INSTANCE; }
}
