package p;
public class B1 extends A1 {
    private static final B1 SINGLE = new B1();
    public B1() {
        super("x");
    }
    public static A1 get() { return SINGLE; }
}
