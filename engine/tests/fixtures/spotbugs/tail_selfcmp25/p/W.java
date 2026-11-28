package p;

public class W {
    int f; int n;
    void wf() { }
    void a1() { // while cond adjacent, call in body
        int x = f;
        while (f == x && n > 0) {
            wf();
        }
    }
    void a2() { // do-while, call in body
        int x = f;
        do {
            wf();
        } while (f == x);
    }
    void a3() { // for, call in body
        int x = f;
        for (; f == x; ) { wf(); }
    }
    void a4() { // call in loop before, cond adjacent
        while (n > 0) { wf(); n--; }
        int x = f;
        while (f == x) { wf(); }
    }
    boolean a5() { // if after load, call in then branch, compare adjacent? no
        int x = f; if (n > 0) wf();
        return x == f;
    }
    boolean a6() { // call in other branch line
        int x = f;
        if (n > 0) { wf(); } return x == f;
    }
    boolean a7() { // boxing between
        int x = f;
        Integer b = n; return x == f;
    }
    boolean a8() { // reversed: earlier load in compare
        int x = f;
        return f == x;
    }
    boolean a9() { // new between
        int x = f;
        Object o = new Object(); return x == f;
    }
    boolean a10() { // call within compare before second load
        int x = f;
        return x + n == f + call();
    }
    int call() { return 0; }
    boolean a11() { // call earlier same line as first load
        wf(); int x = f;
        return x == f;
    }
    boolean a12() { // ternary
        int x = f;
        return n > 0 ? x == f : false;
    }
}
