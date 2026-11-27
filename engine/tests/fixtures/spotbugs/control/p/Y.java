package p;

public class Y {
    boolean c; int x;
    void a(int[] r) {
        for (int i : r) {
            if (c) break; else break;
        }
    }
    void b(int k) {
        for (int i = 0; i < k; i++) {
            if (x > 0) break; else break;
        }
    }
    void d() {
        while (x < 3) {
            if (c) break; else break;
        }
    }
    void e(int k) {
        for (int i = 0; i < k; i++) {
            if (c) break; else break;
        }
    }
    void f(int k) {
        switch (k) {
            case 1: x++; break;
            default: if (x > 0) break; else break;
        }
        x++;
    }
}
