package p;
public class X {
    private static final X INSTANCE = new X();
    public X() {}
    public X copy() { return new X(); }
    public static X getInstance() { return INSTANCE; }
}
