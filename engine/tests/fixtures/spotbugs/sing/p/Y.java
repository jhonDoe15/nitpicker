package p;
public class Y {
    private static Y current;
    public Y() {}
    public static void set(Y y) { current = y; }
    public static Y getInstance() { return current; }
}
