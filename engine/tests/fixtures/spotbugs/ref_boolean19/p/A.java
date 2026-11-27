package p;
import java.util.function.*;
public class A {
    static boolean c() { return true; }
    static Boolean n() { return null; }
    static boolean f(Object o, Object p) { return true; }
    void w1(Boolean a, Boolean b) {
        while (a != b
            || c()) {
            c();
        }
    }
    void w2(Boolean a, Boolean b) {
        while
          (a != b) {
            c();
        }
    }
    void w3(Boolean a, Boolean b) {
        while (
            a != b
        ) {
            c();
        }
    }
    void w4(Boolean a, Boolean b) {
        while (c()
            || a != b) {
            c();
        }
    }
    void w5(Boolean a, Boolean b) {
        do {
            c();
        } while (a != b
            || c());
    }
    void w6(Boolean a, Boolean b) {
        do {
            c();
        } while
          (
            a != b
          );
    }
    void w7(Boolean a, Boolean b) {
        for (int i = 0;
             a != b
              || c();
             i++) {
            c();
        }
    }
    void w8(Boolean a, Boolean b) {
        for (int i = 0;
             (a != b
              || c());
             i++) {
            c();
        }
    }
    void w9(Boolean a, Boolean b) {
        while ((a != b
               ) || c()) {
            c();
        }
    }
    void w10(Boolean a, Boolean b) {
        while (!(a
               != b)) {
            c();
        }
    }
    void w11(Boolean a, Boolean b) {
        while (c() ? a
               != b : c()) {
            c();
        }
    }
    void l1(Boolean a, Boolean b) {
        Supplier<Boolean> s = () -> c()
            ? a == b
            : c();
    }
    void l2(Boolean a, Boolean b) {
        Supplier<Boolean> s = () -> a
            == b;
    }
    void l3(Boolean a, Boolean b) {
        Supplier<Boolean> s = () -> !(a
            == b);
    }
    void l4(Boolean a, Boolean b) {
        Supplier<Boolean> s = () -> n() != null
            && a == b;
    }
    void l5(Boolean a, Boolean b) {
        Supplier<Boolean> s = () ->
            c() &&
            a == b;
    }
    void l6(Boolean a, Boolean b) {
        Supplier<Boolean> s = () -> (a
            == b);
    }
    void l7(Boolean a, Boolean b) {
        Runnable r = () -> f(
            a == b,
            null);
    }
    void l8(Boolean a, Boolean b) {
        Runnable r = () -> f(null,
            c() && a == b);
    }
    void l9(Boolean a, Boolean b) {
        Supplier<String> s = () -> "x"
            + (a
            == b);
    }
    void l10(Boolean a, Boolean b) {
        Supplier<Boolean> s = () -> {
            return a
               == b;
        };
        Supplier<Boolean> t = () -> {
            return c() &&
               a == b;
        };
    }
    void l11(Boolean a, Boolean b) {
        Predicate<Integer> s = i ->
            i > 0 &&
            (a == b ||
             c());
    }
}
