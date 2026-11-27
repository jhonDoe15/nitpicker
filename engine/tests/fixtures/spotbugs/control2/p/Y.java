package p;
public class Y {
    boolean b;
    void foo() {}
    void a() {
        for (int i = 0; i < 3; i++) {
            if (b) {}
        }
    }
    void b() {
        for (int i = 0; i < 3; i++) {
            if (b) {
            }
        }
    }
    void c() {
        for (int i = 0; i < 3; i++) {
            if (b) {}
            // c
        }
    }
    void d() {
        for (int i = 0; i < 3; i++) {
            if (b) {
            }
            // d
        }
    }
    void e() {
        for (int i = 0; i < 3; i++) {
            if (b) {}


        }
    }
    void f() {
        for (int i = 0; i < 3; i++) { if (b) {} }
    }
    void g() {
        for (int i = 0; i < 3; i++) {
            foo();
            if (b) {}



        }
    }
    void h() {
        foo(); if (b) {
        }
        foo();
    }
}
