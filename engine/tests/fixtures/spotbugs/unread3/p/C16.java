package p;

public class C16 {
    private int x;
    private int y;
    Object o = new Object() { int q() { return x; } };
    C16() {
        x = 1;
        y = 2;
    }
}
