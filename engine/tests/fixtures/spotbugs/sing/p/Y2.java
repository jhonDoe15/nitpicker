package p;
public class Y2 {
    private static Y2 current;
    public Y2() {}
    public static void init() { current = new Y2(); }
    public static Y2 getInstance() { return current; }
}
