package p;
public class V1 implements Cloneable {
    static final int M = 2147483647;
    static final String S = "true";
    static boolean live;
    Object o;
    int x;
    void m() {
        int v =
            o
            instanceof String ? 1 : 2;
        x = v;
    }
    static void foo() {
        live = !live;
    }
    V1(int y) {
        x = y;
    }
}
