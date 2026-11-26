package p;
public class B5 extends A5 {
    private static final B5 SINGLE = new B5();
    public B5() {
        super("x");
    }
    public static A5 get() { return SINGLE; }
}
