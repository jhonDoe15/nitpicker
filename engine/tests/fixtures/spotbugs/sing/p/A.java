package p;
public class A {
    private static final A INSTANCE = new A();
    private A() {}
    public static A getInstance() { return INSTANCE; }
}
