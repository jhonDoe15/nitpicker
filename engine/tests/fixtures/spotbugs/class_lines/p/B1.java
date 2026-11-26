package p;
public class B1 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        String s = x
            > 0 ? "a"
            : "b";
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    B1(int y) {
        x = y;
    }
}
