package p;

public class C2 {
    private int x;
    int y;
    protected int z;
    Runnable r() { return () -> {}; }
    static class D extends C2 {}
    C2() {
        x = 1;
        y = 2;
        z = 3;
    }
}
