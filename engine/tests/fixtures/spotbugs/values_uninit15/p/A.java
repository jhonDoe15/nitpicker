package p;

public class A extends Base {
    int h;
    int k;
    String s;
    Object o;
    final int bf;
    int g = h + 1;
    {
        System.out.println(k);
    }
    static int st;

    A(byte z) {
        if (s != null) { }
        if (s == null) { }
        if (h == 0) { }
        bf = 1;
    }
    A(short z) {
        System.out.println(inh);
        System.out.println(this.k);
        bf = 2;
    }
    A(char z) {
        super(3);
        System.out.println(h);
        bf = 3;
    }
    A(long z) {
        System.out.println(h); System.out.println(o);
        System.out.println(h);
        bf = 4;
    }
    A(float z) {
        for (int i = 0; i < 3; i++) {
            System.out.println(s);
            s = "x";
        }
        bf = 5;
    }
    A(double z) {
        try {
            h = Integer.parseInt("1");
        } catch (RuntimeException e) {
            System.out.println(h);
        }
        bf = 6;
    }
    A(boolean z) {
        Object q = new Object() { public String toString() { return s; } };
        bf = 7;
        System.out.println(q);
    }
    A(int[] z) {
        this.k = 1;
        System.out.println(this.toString());
        System.out.println(h);
        bf = 8;
    }
    A(long[] z) {
        System.out.println(z);
        System.out.println(st);
        bf = 9;
        System.out.println(A.this.h);
    }
    A(char[] z) {
        bf = z.length > 0 ? h : 0;
    }
    A(byte[] z) {
        String t = s + o;
        bf = 0;
    }
    A(short[] z) {
        o = s;
        s = (String) o;
        bf = 0;
    }
    A(float[] z) {
        if (h > 0 && k > 0) { }
        bf = 0;
    }
    A(double[] z) {
        Object x = s == null ? null : s.trim();
        bf = 0;
    }
    A(Object[] z) {
        assert s != null;
        synchronized (this) { System.out.println(o); }
        bf = 0;
    }
}
