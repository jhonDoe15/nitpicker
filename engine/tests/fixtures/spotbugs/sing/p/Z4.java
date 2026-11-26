package p;
public class Z4 {
    private static Z4 lazy;
    private Z4() {}
    public static Z4 getLazy() { if (lazy == null) { lazy = new Z4(); } return lazy; }
    public static Z4 last() { return lazy; }
}
