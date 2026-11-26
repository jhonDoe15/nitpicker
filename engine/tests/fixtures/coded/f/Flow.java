package f;
import java.util.*;
class Flow {
    int f; int g = 3; static int s;
    Flow() { f = 1; f = 2; helper(); f = 3; }
    Flow(int x) { this.f = x; this.g = x; }
    void helper() {}
    int labels(int[] a) {
        int x = 0;
        outer:
        for (int i : a) {
            for (int j = 0; j < i; j++) {
                x = j;
                if (j > 3) continue outer;
                if (j > 5) break outer;
                x = 7;
            }
        }
        return x;
    }
    int tries() {
        int y = 1;
        try { y = 2; mayThrow(); y = 3; } catch (Exception e) { return y; } finally { y = 4; }
        int z = 5;
        try { z = 6; return z; } finally { z = 7; }
    }
    void mayThrow() throws Exception {}
    int sw(int k) {
        int r = 0;
        switch (k) {
            case 1: r = 1;
            case 2: r = 2; break;
            case 3: { r = 3; }
            // falls through
            case 4: r = 4; return r;
            default: r = 5;
        }
        int e = switch (k) { case 1 -> { int q = 2; q = 3; yield q; } default -> 0; };
        return r + e;
    }
    void lambdas() {
        int a = 1;
        Runnable q = () -> System.out.println(a);
        Object o = new Object() { int h = 2; public String toString() { h = 4; return "" + a; } };
        int b = 1; b = 2;
        int c = 0; c++; ++c;
        int d = 0; d += 1;
        while (true) { int w = 1; w = 2; if (w > 1) break; }
        do { a = 1; } while (a < 0);
        synchronized (this) { f = 9; }
        s = 1; s = 2;
        int k = 0; k = k++;
    }
    record Rec(String name, int n) { Rec { name = name.trim(); n = 3; } }
    enum En { A, B; int v = 1; En() { v = 2; } }
    void params(int p, String q) { p = 3; q = null; System.out.println(q); }
    void sw2(En e) {
        switch (e) { case A: s = 1; case B: s = 2; }
        switch (e) { case A -> s = 1; case B -> s = 2; }
    }
    int cond(boolean x, boolean y) { int v; if (x && (v = 1) > 0 || y) { return 1; } v = 2; return v; }
    @SuppressWarnings("fallthrough")
    int scoped(int type) {
        switch (type) {
        case 1:
            Flow record = new Flow();
            record.helper();
            break;
        case 2:
            record = new Flow();
            record.helper();
            record = new Flow(type);
            record.helper();
        case 3:
            return 1;
        default:
            return 0;
        }
        return 2;
    }
}
