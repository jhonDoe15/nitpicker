package p;
public class W {
    boolean b;
    void foo() {}
    void f1() {
        for (int i = 0; i < 3; i++) {
            if (b) {}
        }
    }
    void f2() {
        for (int i = 0; i < 3; i++) {
            foo();
            if (b) {}
        }
    }
    void f3() {
        for (int i = 0; i < 3; i++) {
            foo();
            foo();
            if (b) {}
        }
    }
    void f4() {
        for (int i = 0; i < 3;
             i++) {
            foo();
            if (b) {}
        }
    }
    void f5() {
        synchronized (this) {
            foo();
            if (b) {}
        }
    }
    void f6() {
        for (String s : new String[0]) {
            foo();
            if (b) {}
        }
    }
    void f7() {
        try {
            foo();
            if (b) {}
        } catch (RuntimeException e) {
            foo();
        }
    }
    void f8() {
        try {
            foo();
            if (b) {
            }
        } catch (RuntimeException e) {
        }
    }
    void f9() {
        try {
            foo();
        } finally {
            foo();
            if (b) {}
        }
    }
    void f10() {
        try (java.io.StringReader r = new java.io.StringReader("")) {
            if (b) {}
        }
    }
    void f11(int k) {
        switch (k) {
            case 1 -> { if (b) {} }
            default -> { foo(); }
        }
    }
    void f12(int k) {
        switch (k) {
            case 1 -> { foo(); }
            default -> { if (b) {} }
        }
        foo();
    }
    void f13() {
        for (int i = 0; i < 3; i++) {
            foo();
            if (b) continue;
        }
    }
    void f14() {
        for (int i = 0; i < 3; i++) {
            foo(); if (b) {}
        }
    }
}
