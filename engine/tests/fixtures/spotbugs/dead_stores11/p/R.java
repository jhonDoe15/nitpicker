package p;
public class R {
    int f; long g;
    static int num() { return 3; }
    void use(Object o) {}
    void a1() {
        int x = num();
        if (f > 0) {
            use(x);
            x = num();
        }
    }
    void a2() {
        if (f > 0) {
            int x = num();
            use(x);
            x = num();
        }
        use(1);
    }
    void a3() {
        int x;
        if (f > 0) {
            x = num();
        }
        use(1);
    }
    void a4() {
        if (f > 0) {
            int x;
            x = num();
        }
        use(1);
    }
    void b1() {
        int x = num();
        int y = f > 0 ? num() : 2;
    }
    void b2() {
        int y = f > 0 ? 2 : num();
    }
    void b3(int x) {
        use(x);
        int y = f > 0 ? num() : x;
    }
    void b4(long x) {
        int y = (int) x;
    }
    void b5(String s) {
        Object y = (Object) s;
    }
    void b6(int[] a) {
        int y = a.length;
    }
    void b7(Object o) {
        boolean b = o instanceof String;
    }
    void b8(int x) {
        int y = (x);
    }
    void b9() {
        boolean b = num() > 0 && f > 1;
    }
    void c1() {
        int y = g > 0 ? 1 : 2;
        use(1);
    }
    void c2(int[] a) {
        int y = a[0];
    }
    void c3(int i) {
        int y = -i;
    }
    void c4(int i) {
        int y = i + 0;
    }
}
