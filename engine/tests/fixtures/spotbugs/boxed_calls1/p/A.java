package p;

import java.util.function.Supplier;

public class A {
    static final String C = "c";
    String f = new String("init" + f());
    static String g = new String(C);

    static String f() {
        return "x";
    }

    String s1(String s) {
        String a = new String(C);
        return a;
    }

    String s2(String s) {
        String a = new String(s.trim());
        String b = new String(s);
        return a + b;
    }

    String s3(StringBuilder sb) {
        return new String(sb.toString());
    }

    String s4() {
        return new String("lit" + 1);
    }

    String s5(String s) {
        Supplier<String> x = () -> new String(s);
        return x.get() + new String();
    }

    String v1() {
        String a = new String();
        String b = new String();
        return a + b;
    }

    Boolean b1(boolean x) {
        return new Boolean(x);
    }

    Boolean b2(String x) {
        return new Boolean(x);
    }

    Boolean b3() {
        Boolean a = new Boolean(false);
        return a;
    }

    int p1(String s) {
        return Integer.valueOf(s);
    }

    int p2(String s) {
        return Integer.valueOf(s).intValue();
    }

    long p3(String s) {
        return Integer.valueOf(s);
    }

    int p4(String s) {
        return Integer.valueOf(s, 16);
    }

    long p5(String s) {
        return Long.valueOf(s).longValue();
    }

    boolean p6(String s) {
        return Boolean.valueOf(s);
    }

    short p7(String s) {
        return Short.valueOf(s);
    }

    byte p8(String s) {
        return Byte.valueOf(s);
    }

    double p9(String s) {
        return Double.valueOf(s).doubleValue();
    }

    float p10(String s) {
        return Float.valueOf(s);
    }

    long p11(String s) {
        return Integer.valueOf(s).longValue();
    }

    int p12(String s) {
        return Integer.valueOf(s.trim()) + Integer.valueOf(s);
    }

    Integer p13(String s) {
        return Integer.valueOf(s);
    }

    double p14(String s) {
        return Integer.valueOf(s).doubleValue();
    }

    int p15(Integer i) {
        return Integer.valueOf(i);
    }

    int p16(String s) {
        Integer x = Integer.valueOf(s);
        return x;
    }

    String t1(int i) {
        return Integer.valueOf(i).toString();
    }

    String t2(long i) {
        return Long.valueOf(i).toString();
    }

    String t3(double i) {
        return Double.valueOf(i).toString();
    }

    String t4(boolean i) {
        return Boolean.valueOf(i).toString();
    }

    String t5(int i) {
        return ((Integer) i).toString();
    }

    String t6(int i) {
        return new Integer(i).toString();
    }

    String t7(char c) {
        return Character.valueOf(c).toString();
    }

    String t8(float f) {
        return Float.valueOf(f).toString();
    }

    String t9(short f, byte b) {
        return Short.valueOf(f).toString() + Byte.valueOf(b).toString();
    }

    String t10(int i, long l) {
        return Integer.valueOf(i).toString() + Long.valueOf(l).toString();
    }

    String t11(String s) {
        return Integer.valueOf(s).toString();
    }

    String t12(int i) {
        Integer x = i;
        return x.toString();
    }

    int c1(int a, int b) {
        return ((Integer) a).compareTo(b);
    }

    int c2(double a, double b) {
        return Double.valueOf(a).compareTo(b);
    }

    int c3(int a, Integer b) {
        return Integer.valueOf(a).compareTo(b);
    }

    int c4(boolean a, boolean b) {
        return Boolean.valueOf(a).compareTo(b);
    }

    int c5(char a, char b, short s, byte y, float f) {
        return Character.valueOf(a).compareTo(b) + Short.valueOf(s).compareTo(s) + Byte.valueOf(y).compareTo(y) + Float.valueOf(f).compareTo(f);
    }

    int c6(int a, int b, long c, long d) {
        return Integer.valueOf(a).compareTo(b) + Integer.valueOf(b).compareTo(a) + Long.valueOf(c).compareTo(d);
    }

    int c7(Integer a, int b) {
        return a.compareTo(b);
    }

    int c8(String s, int b) {
        return Integer.valueOf(s).compareTo(b);
    }

    Class<?> g1() {
        return new A().getClass();
    }

    Class<?> g2() {
        Class<?> a = new A().getClass();
        Class<?> b = new StringBuilder("x").getClass();
        return a == b ? a : b;
    }

    Class<?> g3() {
        A a = new A();
        return a.getClass();
    }

    Class<?> g4() {
        return new int[3].getClass();
    }

    Class<?> g5() {
        return new Object() {
        }.getClass();
    }
}
