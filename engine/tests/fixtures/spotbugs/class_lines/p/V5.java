package p;
public class V5 implements Cloneable {
    static final int M = 2147483647;
    static final String S = "true";
    static boolean live;
    Object o;
    int x;
    void m() {
        boolean v = S == "true";
        live = v;
    }
    static void foo() {
        live = !live;
    }
    V5(int y) {
        x = y;
    }
}
