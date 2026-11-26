package p;
public class B4 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        String s = live
            ? "a" : "b";
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    B4(int y) {
        x = y;
    }
}
