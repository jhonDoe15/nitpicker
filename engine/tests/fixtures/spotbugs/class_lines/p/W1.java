package p;
public class W1 implements Cloneable {
    static final int A = 1, B = 3, SH = 1 << 3;
    static final String CS = "c";
    int x;
    void m() {
        if ((A & B) != 0) {
        } else {
            x++;
        }
        x--;
    }
    static String sc() {
        return "s";
    }
    W1(int y) {
        x = y;
    }
}
