package p;
public class T {
    int f; int name; String g; long gc;
    static final long K = -2L;
    static int num() { return 3; }
    void use(Object o) {}
    void a1() {
        int name = num();
        use(1);
        name = num();
    }
    void a2() {
        for (int i = 0; i < num(); i++) {
            int name = num();
            use(1);
        }
    }
    void a3() {
        int x = num();
        use(1);
        x = num();
        use(1);
        x = num();
    }
    void a4() {
        if (f > 0) {
            int x = num();
            use(1);
        } else if (f > 1) {
            int x = num();
            use(2);
        } else {
            int x = num();
            use(3);
        }
    }
    void a5() {
        if (f > 0) {
            int x = num();
            use(1);
        }
        if (f > 1) {
            int x = num();
            use(2);
        }
        if (f > 2) {
            int x = num();
            use(3);
        }
    }
    void a6() {
        for (int i = 0; i < num(); i++) {
            long gc = K;
            use(1);
        }
    }
    void a7() {
        for (int i = 0; i < num(); i++) {
            int x = num();
            use(1);
        }
        for (int i = 0; i < num(); i++) {
            int x = num();
            use(1);
        }
    }
}
