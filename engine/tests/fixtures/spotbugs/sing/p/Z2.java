package p;
public class Z2 {
    private static final Z2 INSTANCE = new Z2();
    private static Z2 lazy;
    private Z2() {}
    public static Z2 getLazy() { if (lazy == null) { lazy = new Z2(); } return lazy; }
    public static Z2 getInstance() { return INSTANCE; }
}
