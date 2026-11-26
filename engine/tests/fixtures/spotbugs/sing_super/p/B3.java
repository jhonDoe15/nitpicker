package p;
public class B3 extends A3 {
    private static final B3 SINGLE = new B3();
    private B3() {}
    public static Object get() { return SINGLE; }
}
