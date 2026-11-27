package p;
public class K {
    int f; int gi; long gc;
    static final long C = -2L;
    static int num() { return 3; }
    void use(Object o) {}
    void e1() {
        if (f > 0) { long x = 5L; use(1); } else { long x = 6L; use(2); }
    }
    void e2() {
        if (f > 0) { long x = 5L; use(1); } else { long y = 6L; use(2); }
    }
    void e3() {
        if (f > 0) { int gi = 5; use(1); } else { int gi = 6; use(2); }
    }
    void e4() {
        if (f > 0) { long gc = 5L; use(1); } else { long gc = 6L; use(2); }
    }
    void e5() {
        long x = 5L; use(1); x = 6L;
    }
    void e6() {
        if (f > 0) { int a = num(); use(a); } 
        long x = 5L;
        use(1);
    }
    void e7() {
        if (f > 0) { long a = C; use(1); } else { long b = C; use(2); }
    }
    void e8() {
        if (f > 0) { long a = num(); use(a); }
        long x = 10000L;
        use(1);
    }
    void e9() {
        if (f > 0) { double a = 1.5; use(a); }
        double x = 2.5;
        use(1);
    }
    void e10() {
        if (f > 0) { long a = num(); use(a); }
        long x = 0L;
        use(1);
    }
}
