package p;
public class A6 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        if (DEBUG && x > 0)
            foo();
        foo2(3);
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    A6(int y) {
        x = y;
    }
}
