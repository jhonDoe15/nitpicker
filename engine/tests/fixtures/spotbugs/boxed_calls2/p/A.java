package p;

public class A {
    String t1(long l) {
        return Long.valueOf(l).toString();
    }

    String t2(long l) {
        return new Long(l).toString();
    }

    String t3(int i) {
        return new Integer(i)
            .toString();
    }

    String t4(int i) {
        return Integer
            .valueOf(i)
            .toString();
    }

    int c1(int a, int b) {
        return new Integer(a).compareTo(b);
    }

    int c2(int a, int b) {
        return Integer.valueOf(a).compareTo(Integer.valueOf(b));
    }

    int c3(int a, Integer b) {
        Integer x = a;
        return x.compareTo(a);
    }

    int c4(int a, int b) {
        return Integer.valueOf(a)
            .compareTo(
                b);
    }

    int c5(int a, short b) {
        return Integer.valueOf(a).compareTo((int) b);
    }

    int p1(String s) {
        return Integer
            .valueOf(s)
            .intValue();
    }

    int p2(String s) {
        int x = 3 + Integer.valueOf(s);
        return x;
    }

    String p3(String s) {
        return "a" + Integer.valueOf(s);
    }

    boolean p4(String s) {
        return Integer.valueOf(s) == 3;
    }

    int p5(String s, String t) {
        return Integer.valueOf(s) + Long.valueOf(t).intValue() + Integer.valueOf(t);
    }

    int p6(String s) {
        int[] a = new int[2];
        a[0] = Integer.valueOf(s);
        return a[Integer.valueOf(s)];
    }

    double p7(String s) {
        return Double.valueOf(s) * 2;
    }

    long p8(String s) {
        return -Long.valueOf(s);
    }

    int p9(String s) {
        int x = Integer.valueOf(
            s);
        return x;
    }

    String s1(String s) {
        return new String(
            s.trim());
    }

    String s2(String s) {
        return new String(
            s);
    }

    Class<?> g1() {
        return new A()
            .getClass();
    }

    boolean g2() {
        return new A().getClass() == A.class && new String("x") != null && new Boolean(true);
    }
}
