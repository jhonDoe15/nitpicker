package p;

public class C3 {
    private int x;
    int y;
    protected int z;
    java.util.function.Supplier<Integer> s() { return () -> 1; }
    C3() {
        x = 1;
        y = 2;
        z = 3;
    }
}
