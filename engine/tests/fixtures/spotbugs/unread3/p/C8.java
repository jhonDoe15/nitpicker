package p;

public class C8 {
    private int x;
    private int y;
    void self(C8 o) { o.y = o.y; }
    C8() {
        x = 1;
        y = 2;
    }
}
