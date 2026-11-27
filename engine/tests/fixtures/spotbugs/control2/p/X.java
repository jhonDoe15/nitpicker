package p;
public class X {
    boolean b;
    void foo() {}
    void g1() {
        foo(); if (b) {} foo();
    }
    void g2() {
        for (int i = 0; i < 3; i++) {
            foo();
            foo();
            foo();
            foo();
            foo();
            foo();
            if (b) {}
        }
    }
    void g3() {
        int i = 0;
        while (i < 3) {
            i++;
            if (b) continue;
        }
    }
    void g4() {
        synchronized (this) {
            if (b) {}
        }
        foo();
    }
    void g5() {
        try {
            if (b) {}
        } catch (RuntimeException e) { }
    }
    void g6() {
        try {
            if (b) {}
        } finally {
            foo();
        }
    }
    void g7() {
        for (int i = 0; i < 3; i++) {
            if (b) {
            }
            // gap
            // gap
        }
    }
    void g8() {
        do {
            foo();
            if (b) continue;
        } while (b);
    }
}
