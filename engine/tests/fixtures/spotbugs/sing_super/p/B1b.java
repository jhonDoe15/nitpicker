package p;
public class B1b extends A1 {
    private static final B1b SINGLE = new B1b();
    public B1b() {
        super("y");
    }
    public static A1 get() { return SINGLE; }
}
