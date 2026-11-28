package p;
public class D2 {
    private static final D2 INSTANCE = new D2();
    private D2() {}
    public static D2 getInstance() { return INSTANCE; }
    @Override
    protected Object clone() throws CloneNotSupportedException { return super.clone(); }
}
