package p;

public class C13 {
    private int x;
    private int y;
    void s() { synchronized (this) { x = 3; } }
    C13() {
        x = 1;
        y = 2;
    }
}
