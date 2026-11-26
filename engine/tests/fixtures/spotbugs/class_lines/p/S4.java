package p;
public class S4 implements Cloneable {
    static boolean live;
    int x;
    String str;
    Object m() {
        if (one
            () > 0) foo2(1);
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
    S4(int y) {
        x = y;
    }
}
