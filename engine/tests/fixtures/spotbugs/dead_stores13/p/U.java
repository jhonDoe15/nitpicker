package p;
public class U {
    int f; int name;
    static int num() { return 3; }
    void use(Object o) {}
    void s1() {
        int name = num();
        use(1);
        name = num();
        use(1);
        name = num();
    }
    void s2() {
        for (int i = 0; i < num(); i++) {
            int name = num();
            use(1);
            name = num();
            use(1);
        }
    }
    void s3() {
        if (f > 0) {
            int name = num();
            use(1);
        }
        int other = num();
        use(other);
    }
    void s4() {
        int name = num();
        use(1);
        name = f;
    }
    void s5() {
        while (f > 0) {
            int name = num();
            use(name);
            name = num();
        }
    }
    void s6() {
        int name = num();
        if (f > 0) {
            name = num();
        }
    }
    void d1() {
        int x = num();
        if (f > 0) {
            x = num();
        }
    }
    void d2() {
        while (f > 0) {
            int x = num();
            use(x);
            x = num();
        }
    }
}
