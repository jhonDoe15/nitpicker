package p;
public class S1 implements Cloneable {
    static boolean live;
    int x;
    String str;
    Object m() {
        int v = inst
            ();
        foo2(v);
        return null;
    }
    static int one() {
        return 1;
    }
    int inst() {
        return 2;
    }
    static int foo2(int a) {
        return a + 1;
    }
    S1(int y) {
        x = y;
    }
}
