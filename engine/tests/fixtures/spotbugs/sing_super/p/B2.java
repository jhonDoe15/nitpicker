package p;
public class B2 extends A2 {
    private static final B2 SINGLE = new B2();
    private B2() {}
    public static A2 get() { return SINGLE; }
}
