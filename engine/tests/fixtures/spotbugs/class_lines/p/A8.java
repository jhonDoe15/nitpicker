package p;
public class A8 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        if (DEBUG == false)
            foo();
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    A8(int y) {
        x = y;
    }
}
