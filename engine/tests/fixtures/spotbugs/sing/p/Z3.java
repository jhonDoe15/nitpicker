package p;
public class Z3 {
    private static Z3 lazy;
    private Z3() {}
    public static Z3 first() { return lazy; }
    public static Z3 getLazy() { if (lazy == null) { lazy = new Z3(); } return lazy; }
}
