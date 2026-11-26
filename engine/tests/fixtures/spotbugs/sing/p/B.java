package p;
public class B {
    private static final B INSTANCE = new B();
    public B() {}
    public static B getInstance() { return INSTANCE; }
}
