package p;
public class A4 implements Cloneable {
    static final boolean DEBUG = false;
    static final boolean ON = true;
    static boolean live;
    int x;
    void m() {
        if (Other.FLAG)
            foo();
        else
            foo2(2);
    }
    static void foo() {
        live = !live;
    }
    static int foo2(int a) {
        return a + 1;
    }
    A4(int y) {
        x = y;
    }
}
