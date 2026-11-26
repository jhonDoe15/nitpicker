package p;
public class P1 {
    private static final P1 INSTANCE = new P1();
    public P1() {}
    private static P1 getInstance() { return INSTANCE; }
}
