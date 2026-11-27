package p;

public class O {
    private int a;
    private int b;
    private int c = 7;
    private int d;
    private int e;
    private int f;

    void early() {
        a = 1;
        c = 2;
        d = 1;
    }

    Runnable lam() {
        return () -> e = 3;
    }

    O() {
        a = 2;
        b = 2;
        e = 4;
    }

    O(int x) {
        this();
        f = x;
        d = x;
    }

    void late() {
        b = 3;
        f = 1;
    }
}
