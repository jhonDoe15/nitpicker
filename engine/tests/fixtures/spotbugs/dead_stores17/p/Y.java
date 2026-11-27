package p;
import java.io.*;
import java.util.*;
public class Y {
    interface U { boolean changed(); }
    static Object num() { return 3; }
    void add(U u) {}
    void a1() {
        Object a = num();
        Object b = num();
        add(new U() {
            public boolean changed() { return a.equals(b); }
        });
    }
    boolean a2(InputStream s) {
        try (Reader r = new InputStreamReader(s)) {
            Object query = num();
            return true;
        } catch (IOException e) {
            throw new AssertionError("x", e);
        }
    }
    record R(Object dataRetention, Object rounds) {
        static R read(int x) {
            boolean enabled = true;
            Object dataRetention = num();
            Object rounds = num();
            if (x > 0) {
                dataRetention = num();
            } else {
                dataRetention = String.valueOf(x);
            }
            if (x > 1) {
                rounds = num();
            } else {
                rounds = String.valueOf(x);
            }
            enabled = x > 3;
            return new R(dataRetention, rounds);
        }
    }
    static class Q {
        Object dataRetention;
        static Q read(int x) {
            Object dataRetention = num();
            if (x > 0) {
                dataRetention = num();
            } else {
                dataRetention = String.valueOf(x);
            }
            Q q = new Q();
            q.dataRetention = dataRetention;
            return q;
        }
        Q read2(int x) {
            Object dataRetention = num();
            if (x > 0) {
                dataRetention = num();
            } else {
                dataRetention = String.valueOf(x);
            }
            Q q = new Q();
            q.dataRetention = dataRetention;
            return q;
        }
    }
    Object a3() {
        final Object parsed = num();
        assert false : "never";
        return parsed;
    }
}
