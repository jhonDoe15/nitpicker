package p;
public class H {
    static int num() { return 3; }
    void use(Object o) {}
    void a1() {
        int x = num();
        use(1);
        x = num();
        use(x);
    }
    void a2() {
        int x = num();
        use(1);
        x = num();
        use(1);
        x = num();
        use(x);
    }
    void a3() {
        int x = num();
        use(x);
        x = num();
        use(x);
        x = num();
    }
    void a4() {
        int x = num();
        use(x);
        x = num();
    }
    void a5() {
        int x = num();
        use(x);
        x = num();
        use(x);
        x = num();
        use(x);
        x = num();
    }
    void a6() {
        int x = num();
        use(1);
        x = num();
    }
    void a7() {
        int x = num();
        use(1);
        x = num();
        use(1);
        x = num();
    }
    void a8() {
        int x = num();
        use(x);
        int y = num();
        use(y);
        x = num();
    }
    void a9() {
        int x = num();
        use(x);
        x = 5;
        use(x);
        x = num();
    }
}
