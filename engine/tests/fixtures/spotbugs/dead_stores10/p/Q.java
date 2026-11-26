package p;
public class Q {
    int f;
    static int num() { return 3; }
    static Object make() { return new Object(); }
    void use(Object o) {}
    void a1() {
        try { use(1); } catch (RuntimeException e) {
            RuntimeException e2 = e;
            use(2);
        }
    }
    void a2() {
        try { use(1); } catch (RuntimeException e) {
            Object e2 = e;
            use(2);
        }
    }
    void a3(RuntimeException e) {
        RuntimeException e2 = e;
        use(2);
    }
    void a4() {
        RuntimeException e = new RuntimeException();
        use(e);
        RuntimeException e2 = e;
        use(2);
    }
    void a5() {
        Object o = make();
        use(o);
        Object e2 = o;
        use(2);
    }
    void b1() {
        if (f > 0) { int a = num(); use(a); }
        if (f > 1) { int b = num(); use(b); }
        if (f > 2) { int c = num(); use(c); }
        int d = num();
        use(1);
    }
    void b2() {
        if (f > 0) { int a = num(); use(a); }
        if (f > 1) { int b = num(); use(b); }
        int d = num();
        use(1);
    }
    void b3(int p) {
        use(p);
        p = num();
        use(p);
        p = num();
        use(p);
        p = num();
    }
    void b4(int p) {
        use(p);
        p = num();
        use(p);
        p = num();
    }
}
