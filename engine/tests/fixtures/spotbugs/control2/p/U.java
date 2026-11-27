package p;
import java.util.*;
import java.util.function.*;
public class U {
    static final boolean DEBUG = false;
    int fld; boolean b; Object o; String s;
    void t1() {
        try {
            foo();
        } catch (Exception e) {
            if (b) {
            }
        }
        foo();
    }
    void t2() {
        try {
            foo();
            if (b) {
            }
        } catch (Exception e) {
            foo();
        }
    }
    void t3() {
        try {
            foo();
        } finally {
            if (b) {
            }
        }
    }
    void t4() {
        synchronized (this) {
            if (b) {
            }
        }
        foo();
    }
    void t5() {
        synchronized (this) {
            foo();
            if (b) {
            }

            foo();
        }
    }
    void t6() {
        lbl: {
            if (b) {
            }
            foo();
        }
    }
    void t7(int k) {
        switch (k) {
            case 1 -> {
                if (b) {
                }
            }
            case 2 -> foo();
            default -> {}
        }
        foo();
    }
    void t8(int k) {
        switch (k) {
            case 1:
                if (b) {
                }
            case 2:
                foo();
                break;
        }
    }
    void t9(int k) {
        switch (k) {
            case 1:
                if (b) {
                }
                break;
            case 2:
                foo();
        }
    }
    void t10() {
        {
            {
                if (b) {
                }
            }
        }
        foo();
    }
    void t11(int k) {
        if (k == 1) {
            foo();
        } else if (b) {
        } else {
            foo();
        }
        foo();
    }
    void t12() {
        while (b) {
            if (b) {
            }
        }
        foo();
    }
    void t13() {
        for (int i = 0; i < 3; i++) {
            if (b) {
            }
        }
    }
    void t14() {
        do {
            if (b) {
            }
        } while (b);
    }
    void t15(List<String> l) {
        for (String x : l) {
            if (b) {
            }
        }
    }
    void t16() {
        Runnable r = () -> {
            if (b) {
            }
        };
        r.run();
    }
    U() {
        if (b) {
        }
        foo();
    }
    static { if (DEBUG2()) { } foo2(); }
    { if (b) { } foo(); }
    static boolean DEBUG2() { return true; }
    static void foo2() {}
    int t17() {
        if (b) {
        }
        return 1;
    }
    int t18() {
        foo();
        if (b) {
        }
        return fld;
    }
    void foo() {}
}
