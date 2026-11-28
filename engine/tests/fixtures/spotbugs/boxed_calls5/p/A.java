package p;

import java.util.function.*;

public class A {
    String s1(char[] c, StringBuilder sb, byte[] b, int[] cp) {
        String a = new String(c);
        String d = new String(sb);
        String e = new String(new StringBuffer());
        return a + d + e + new String(b) + new String(c, 0, 1) + new String(cp, 0, 1);
    }
    String s2(String x) {
        return new java.lang.String(x);
    }
    Boolean b1(boolean x, String s) {
        Boolean a = new java.lang.Boolean(x);
        Boolean b = new Boolean(s);
        return a;
    }
    int cmp1(int a, int b) {
        Integer x = a;
        return x.compareTo(b);
    }
    int cmp2(int a, Integer b) {
        Integer x = Integer.valueOf(a);
        return x.compareTo(b);
    }
    int cmp3(int a, int b) {
        Integer x = Integer.valueOf(a);
        x = Integer.valueOf(b);
        return x.compareTo(b);
    }
    int cmp4(int a, int b, Integer z) {
        Integer x = Integer.valueOf(a);
        x = z;
        return x.compareTo(b);
    }
    int cmp5(int a, int b, boolean c) {
        Integer x = c ? Integer.valueOf(a) : Integer.valueOf(b);
        return x.compareTo(b);
    }
    int cmp6(int a, int b) {
        return ((Integer) a).compareTo((Integer) b);
    }
    int cmp7(int a, long b) {
        return Long.valueOf(a).compareTo(b);
    }
    int cmp8(int a, int b) {
        return Integer.valueOf(a).compareTo(Integer.valueOf(b));
    }
    int cmp9(int a, int b) {
        return Integer.valueOf(a)
            .compareTo(
                b);
    }
    int cmp10(Integer a, int b) {
        return a.compareTo(b);
    }
    int cmp11(short a, short b) {
        return Short.valueOf(a).compareTo(b);
    }
    int cmp12(char a, char b) {
        return Character.valueOf(a).compareTo(b);
    }
    int cmp13(double a, double b) {
        return Double.valueOf(a).compareTo(b);
    }
    int cmp14(float a, float b) {
        return Float.valueOf(a).compareTo(b);
    }
    int cmp15(int a, int b) {
        Integer x = Integer.valueOf(a);
        Supplier<Integer> s = () -> x.compareTo(b);
        return s.get();
    }
    int cmp16(int a) {
        Integer x = 1;
        return x.compareTo(a);
    }
    int cmp17(int a) {
        final Integer x = a;
        for (int i = 0; i < 2; i++) { x.compareTo(i); }
        return 1;
    }
    int cmp18(int a) {
        Integer x = Integer.valueOf(a);
        x++;
        return x.compareTo(a);
    }
    String ts1(int i, long l) {
        Integer x = i;
        return x.toString() + ((Integer) i).toString() + Long.valueOf(l).toString();
    }
    String ts2(int i) {
        return Integer.valueOf(i).toString(); 
    }
    String ts3(String s) {
        return Integer.valueOf(s).toString();
    }
    String ts4(short i) {
        return new Short(i).toString() + Short.valueOf(i).toString();
    }
    String ts5(long i) {
        return new Long(i).toString();
    }
    String ts6(int i) {
        return Integer
            .valueOf(i)
            .toString();
    }
    String ts7(int i) {
        return ((Integer) (i + 1)).toString();
    }
    String ts8(byte i) {
        return ((Integer) (int) i).toString();
    }
    String ts9(Integer i) {
        return Integer.valueOf(i).toString();
    }
    String ts10(char i) {
        return Integer.valueOf(i).toString();
    }
    String ts11(String i) {
        return new Integer(i).toString() + new Boolean(i).toString();
    }
    String ts12(int i) {
        return Integer.valueOf(i).toString(10);
    }
    String ts13(int i) {
        return String.valueOf(i).toString() + "a".toString() + i;
    }
    Class<?> g1() { return new A().getClass(); }
    Class<?> g2() { return new int[0].getClass(); }
    Class<?> g3() { return new A[0].getClass(); }
    Class<?> g4() { return (new A()).getClass(); }
    Class<?> g5() { return new A() { }.getClass(); }
    Class<?> g6() { return new A()
        .getClass(); }
    Class<?> g7() { return this.new B().getClass(); }
    class B {}
    Class<?> g8() { return new java.util.ArrayList<String>().getClass(); }
    Class<?> g9() { return new A().getClass().getClass(); }
    Class<?> g10() { return ((Object) new A()).getClass(); }
    Class<?> g11() { return new A() {}.getClass(); }
    Class<?> g12() { return new Object() { }.getClass(); }
}
