package e;

import java.util.function.LongSupplier;
import java.util.function.Supplier;

class S16BoxedTarget {
    enum Kind {
        A(new Long(1)),
        B(new Long(2L));

        Kind(Object o) {}
    }

    S16BoxedTarget() {}

    S16BoxedTarget(Object o) {}

    Long field = new Long(1);

    Object returns(int i) {
        return new Long(i);
    }

    long returnsPrimitive(int i) {
        return new Long(i);
    }

    void locals(int i, char c, long l, short s) {
        var v = new Long(i);
        var w = (new Integer(c));
        Integer boxed = new Integer(c);
        Long boxedLong = new Long(i);
        Number n = new Long(i);
        Object o = (new Long(i));
        Object p = (Object) (new Long(i));
        long m = new Long(i);
        new S16BoxedTarget(new Long(i));
        new S16BoxedTarget(new Integer(c));
    }

    void asserts(int i) {
        assert i > 0 : new Long(i);
        assert i > 0 : new Integer(i);
        assert new Boolean(true);
    }

    void loops(int i) {
        for (; new Boolean(true); ) {
            break;
        }
        while (new Boolean(true)) {
            break;
        }
        do {
            break;
        } while (new Boolean(true));
        if (new Boolean(true)) {
            return;
        }
        long q = true ? new Long(i) : 0L;
        Object r = true ? new Long(i) : null;
        Object t = new Boolean(true) ? 1 : 2;
    }

    void arrays(int i, char c, byte bt, int[] ia, long[] la) {
        int[] sa = new int[new Short(bt)];
        int sb = ia[new Short(bt)];
        int sc = ia[(new Short(bt))];
        int[] a = new int[new Integer(c)];
        int[][] b = new int[new Integer(c)][new Integer(i)];
        long[] d = {new Long(i)};
        Object[] e = {new Long(i)};
        long[] f = new long[] {new Long(i)};
        Object[] g = new Object[] {new Long(i), new Integer(c)};
        int h = ia[new Integer(c)];
        int j = ia[(new Integer(c))];
    }

    void switches(int i, char c) {
        switch (new Integer(c)) {
            default:
        }
        switch (new Character('c')) {
            default:
        }
        long r = switch (i) {
            case 1 -> new Long(i);
            default -> new Long(c);
        };
        Object r1 = switch (i) {
            case 1 -> new Long(i);
            default -> new Integer(c);
        };
        long r2 = switch (i) {
            case 1:
                yield new Long(i);
            default: {
                yield new Long(c);
            }
        };
        long r3 = switch (i) {
            default -> {
                yield new Long(i);
            }
        };
        long r4 = switch (new Integer(c)) {
            default -> 1L;
        };
        Object r5 = switch (i) {
            default -> {
                if (i > 0) {
                    yield new Long(i);
                }
                yield new Long(c);
            }
        };
        switch (i) {
            case 1 -> new Long(i);
            default -> {
                Object x = new Long(i);
            }
        }
        switch (i) {
            case 1:
                Object y = new Long(i);
        }
    }

    void other(int i, long l, Object lock) {
        synchronized (new Long(i)) {
        }
        boolean b = new Long(i) instanceof Long;
        boolean b2 = (new Long(i)) instanceof Long;
        long u = -new Long(i);
        long v = -(new Long(i));
        l += new Long(i);
        l <<= new Long(i);
        String z = "" + new Long(i);
        long y = new Long(i) + 1;
        boolean e = new Long(i) == l;
        boolean e2 = new Long(i) == lock;
        long sh = 1L << new Long(i);
        long sh2 = new Long(i) << 1;
        LongSupplier ls = () -> new Long(i);
        Supplier<Object> so = () -> new Long(i);
        Supplier<Object> sr = () -> {
            return new Long(i);
        };
        new Long(i);
        Object[] oa = new Object[2];
        oa[0] = new Long(i);
    }
}
