package p;
public class X {
    int f;
    static int num() { return 3; }
    void use(Object o) {}
    void a1(String a) {
        use(a);
        a = null;
    }
    void a2(String a) {
        if (f > 0) {
            a = null;
        }
        use(1);
    }
    void a3(String a) {
        a = "x";
        use(a);
    }
    void a4(int a) {
        a = num();
        use(a);
    }
    void a5(int a) {
        if (f > 0) {
            a = num();
        } else {
            a = 3;
        }
        use(a);
    }
    void a6(int a) {
        if (f > 0) {
            a = 3;
        } else {
            a = num();
        }
        use(a);
    }
    void a7(int a, int b) {
        a = b;
        use(a);
        b = num();
    }
    void a8() {
        String s = String.valueOf(f);
        use(s);
        s = null;
    }
    void a9(String a) {
        use(a);
        a = null;
        use(1);
        a = null;
    }
}
