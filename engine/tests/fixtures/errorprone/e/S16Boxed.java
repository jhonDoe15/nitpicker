import java.util.List;

class S16Boxed {
    static final boolean CONST = true;
    static final String CONST2 = "TRUE";

    void foo(Float f) {}

    void foo(Object f) {}

    static int g(int x) {
        return x;
    }

    S16Boxed(Long l) {}

    S16Boxed() {}

    void positive(double dd, Double boxed, int x, short sh, float ff, List<String> strings) {
        byte b = new Byte((byte) 0);
        char c = new Character((char) 0);
        double d = new Double(0);
        float f = new Float(0);
        int i = new Integer(0);
        long j = new Long(0);
        short s = new Short((short) 0);
        float f2 = new Float(dd);
        float f3 = new Float(d);
        float f4 = new Float(boxed);
        foo(new Float(d));
        foo(new Float(boxed));
        Double dw = new Double(ff);
        Short sw = new Short((byte) 0);
        Object o = new Long(x);
        Object o2 = new Integer(x);
        long total = new Long(x) + 1;
        Long big = new Long(x);
        long viaAssign;
        viaAssign = new Long(x);
        Number n = true ? new Long(x) : Integer.valueOf(1);
        new S16Boxed(new Long(x));
        Object cast = (Object) new Long(x);
        i = g(new Integer(x));
        i = new Integer(sh);
        long w = (new Long(x));
        System.out.println(new Long(x));
        new Long(x);
        int[] arr = {new Integer(sh)};
        long neg = -new Long(x);
    }

    void strings() {
        byte b = new Byte("0");
        double d = new Double("0");
        float f = new Float("0");
        int i = new Integer("0");
        long j = new Long("0");
        short s = new Short("0");
        char c = new Character('c');
    }

    void booleans() {
        boolean a = new Boolean(true);
        boolean b = new Boolean(false);
        boolean c = new Boolean(CONST);
        boolean e = new Boolean("true");
        boolean f = new Boolean("nope");
        boolean g = new Boolean(CONST2);
        System.err.println(new Boolean("true"));
        System.err.println(new Boolean("false"));
        System.err.println(new Boolean(true));
        Object h = (Object) new Boolean(true);
        boolean k = new Boolean(a);
        String t = new Boolean(true).toString();
        boolean u = new java.lang.Boolean("TRUE");
    }

    void calls(int x, double d, Double dd, Float f, Integer y) {
        int i = new Integer(x).byteValue();
        String s = new Integer(x).toString();
        String s2 = new Integer("1").toString();
        int c1 = new Integer(x).compareTo(y);
        int c2 = y.compareTo(new Integer(x));
        int c3 = new Float(d).compareTo(f);
        int c4 = new Float(dd).compareTo(f);
        int h = new Integer(x).hashCode();
        h = new Float(d).hashCode();
        h = new Float(dd).hashCode();
        h = new Long(x).hashCode();
        String p = (new Integer("1")).toString();
        String q = (new Integer(x)).toString();
        String r = Integer.valueOf(new Integer(x)).toString();
        String u = Integer.valueOf(new Integer("2")).toString();
        h = Integer.valueOf(new Integer("2")).hashCode();
        int m = new Integer(x).MAX_VALUE;
        int w = (new Integer(x)).compareTo(y);
        int z = new Integer("3").compareTo(new Integer(4));
    }

    <T> T generic(Object o) {
        return (T) new Integer(o.hashCode());
    }

    Object unrelated() {
        String s = new String("x");
        return new Object();
    }

    @SuppressWarnings("BoxedPrimitiveConstructor")
    void suppressed() {
        Integer i = new Integer(1);
    }
}
