package p;

import java.io.File;
import java.math.BigDecimal;
import java.util.*;
import java.util.function.*;

public class A {
    static final int SHIFT = 8;
    static final long BIG = 3000000000L;
    static final File HOME = new File("/home/app/data");
    static final BigDecimal RATE = new BigDecimal(0.05);
    final int mask = 0xff;
    int[] table = new int[16];
    byte[] data = new byte[4];
    static int counter = (int) (Math.random() * 10);
    Object key;

    enum Kind {
        ONE {
            int code(byte b) { return b == 200 ? 1 : 0; }
        };
        abstract int code(byte b);
    }

    interface Hasher {
        default int slot(Object o, int n) { return Math.abs(o.hashCode()) % n; }
    }

    int combine(byte hi, byte lo) {
        return (hi << SHIFT) | lo;
    }

    long wide(byte[] b) {
        long r = 0;
        for (byte x : b) {
            r = (r << 8) | x;
        }
        return r;
    }

    int readInt(byte[] b, int off) {
        return (b[off] << 24) | (b[off + 1] << 16)
            | (b[off + 2] << 8)
            | b[off + 3];
    }

    boolean checks(byte b, char c, int x, long l) {
        if (b == 0xff) {
            return true;
        }
        if (c == -1 || x > BIG) {
            return false;
        }
        return l > Integer.MAX_VALUE && x <= Integer.MAX_VALUE;
    }

    Runnable lambdas(Random r) {
        Supplier<Integer> s = () -> Math.abs(r.nextInt());
        IntUnaryOperator op = v -> v & -1;
        return () -> System.out.println(s.get() + op.applyAsInt(3) + (int) r.nextDouble());
    }

    Object anon() {
        return new Object() {
            @Override
            public int hashCode() {
                return table[key.hashCode() % table.length];
            }
        };
    }

    String strings(String s, StringBuilder sb) {
        String t = s
            .substring(0);
        return t + sb.substring(0) + new File("D:\\data").getName();
    }

    int minmax(int v) {
        int lo = Math.max(0, v);
        int hi = Math.min(-5, lo);
        return Math.min(10, Math.max(20, v)) + hi;
    }

    double bits(int i) {
        return Double.longBitsToDouble(i) + Double.longBitsToDouble(i << 1);
    }

    int twice(int x, int y) {
        int a = x | 0;
        int b = y | 0;
        int c = x & -1;
        return a + b + c + (x % 1) + (y % 1);
    }

    int dedupe(byte[] b, long l, int x) {
        int i = (x << 8) | b[0];
        long j = (l << 8) | b[1];
        return i + (int) j;
    }

    List<String> lists(List<String> names, Random r) {
        String a = names.get(r.nextInt() % names.size());
        names.set(key.hashCode() % names.size(), a);
        return names;
    }

    int multiline(Object o,
                  int n) {
        return Math.abs(
            o.hashCode()
        );
    }
}
