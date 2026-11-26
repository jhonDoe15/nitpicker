package p;
public class V2 implements Cloneable {
    static final int M = 2147483647;
    static final String S = "true";
    static boolean live;
    Object o;
    int x;
    void m() {
        if (M + 1 > 0)
            foo();
        else
            x = 3;
    }
    static void foo() {
        live = !live;
    }
    V2(int y) {
        x = y;
    }
}
