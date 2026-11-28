package p;
public class A {
    static Boolean n() { return null; }
    void t3(Boolean a, Boolean b) {
        while (n() != null
            && a == b) {
            System.out.println();
        }
    }
    void t4(Boolean a, Boolean b) {
        for (int i = 0;
             a == b;
             i++) {
            System.out.println();
        }
    }
    void t5(Boolean a, Boolean b) {
        for (int i = 0; i < 1; i += a == b ? 1 : 2) {
            System.out.println();
        }
    }
    void t6(Boolean a, Boolean b) {
        do {
            System.out.println();
        } while (a == b);
    }
    void t7(Boolean a, Boolean b) {
        for (boolean q = a == b;;) {
            System.out.println();
            break;
        }
    }
    void t8(Boolean a, Boolean b) {
        while (a == b) {
            System.out.println();
        }
    }
    void t9(Boolean a, Boolean b) {
        for (Boolean i = a; i != b; i = n()) {
            System.out.println();
        }
    }
    void t10(Boolean a, Boolean b) {
        switch (a == b ? 1 : 2) {
            case 1: break;
            default: break;
        }
    }
    int t11(Boolean a, Boolean b) {
        switch (n() == null ? 1 : 2) {
            case 1: return b != a ? 3 : 4;
            default: return 0;
        }
    }
    void t12(Boolean a, Boolean b) {
        label:
        if (a == b) { }
    }
    void t13(Boolean a, Boolean b) {
        if (a == b) { }
        else if (b != a) { }
        else if (a
            == b) { }
    }
    void t14(Boolean a, Boolean b) {
        boolean x = a == b,
            y = b != a;
    }
}
