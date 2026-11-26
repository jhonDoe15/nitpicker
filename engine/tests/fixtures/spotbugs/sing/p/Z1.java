package p;
public class Z1 {
    private static final Z1 INSTANCE = new Z1();
    private static Z1 lazy;
    private Z1() {}
    public static synchronized Z1 getInstance() { return INSTANCE; }
    public static Z1 getLazy() { if (lazy == null) { lazy = new Z1(); } return lazy; }
}
