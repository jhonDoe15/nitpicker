package p;
public class B2 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        x = x
            > 0 ? 1
            : 2;
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    B2(int y) {
        x = y;
    }
}
