package p;
import java.util.function.*;
public class A {
    static Boolean n() { return null; }
    boolean t1(Boolean a, Boolean b) {
        return n() != null
            && a == b;
    }
    boolean t2(Boolean a, Boolean b) {
        if (n() != null
            && a == b) {
            return true;
        }
        return false;
    }
    void t3(Boolean a, Boolean b) {
        while (n() != null
            && a == b) {
            break;
        }
    }
    void t4(Boolean a, Boolean b) {
        for (int i = 0;
             a == b;
             i++) {
            break;
        }
    }
    void t5(Boolean a, Boolean b) {
        for (int i = 0; i < 1; i += a == b ? 1 : 2) {
            break;
        }
    }
    void t6(Boolean a, Boolean b) {
        do {
            System.out.println();
        } while (a == b);
    }
    void t7(Boolean a, Boolean b) {
        assert a == b : "x";
    }
    void t8(Boolean a, Boolean b) {
        Supplier<Boolean> s = () ->
            a == b;
        Supplier<Boolean> s2 = () -> {
            System.out.println();
            return
              a != b;
        };
    }
    void t9(Boolean a, Boolean b) {
        System.out.println(
            a == b);
        String.format("", n(),
            a == b);
    }
    void t10(Boolean a, Boolean b) {
        Boolean x =
            a == b ? n() : null;
        Boolean y = n() == null ?
            Boolean.valueOf(a == b) : null;
    }
    int t11(Boolean a, Boolean b) {
        return switch (n() == null ? 1 : 2) {
            case 1 -> a == b ? 1 : 0;
            default -> {
                yield b == a ? 3 : 4;
            }
        };
    }
    void t12(Boolean a, Boolean b) {
        synchronized (this) {
            boolean z = a == b;
        }
        try {
            boolean y = a != b;
        } catch (Exception e) {
        } finally {
            boolean w = a == b || b == n();
        }
    }
    void t13(Boolean a, Boolean b) {
        int[] arr = new int[a == b ? 1 : 2];
        String s = "x" +
            (a == b) +
            "y";
        boolean[] bs = { a == b,
           a != b };
    }
    void t14(Boolean a, Boolean b) {
        boolean x, y;
        x = true;
        y =
            a == b;
    }
    void t15(Boolean a, Boolean b) {
        throw new IllegalStateException(
            "" +
            (a == b));
    }
}
