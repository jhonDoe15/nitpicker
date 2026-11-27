package p;

import java.util.*;
import java.util.function.*;

public class A {
    int a;
    int b;
    String s;
    List<String> list;
    Object o;
    static int st;
    final int f = 3;
    int g = 4;
    int h;

    A(int x) {
        a = b + x;
    }
    A(String x) {
        s = x;
        System.out.println(s.length());
    }
    A(String x, int y) {
        System.out.println(s);
        s = x;
    }
    A(List<String> x) {
        list.add("a");
        list = x;
    }
    A(Object x, int y) {
        if (y > 0) { o = x; }
        System.out.println(o);
    }
    A(long x) {
        st = st + 1;
        a = f + g;
    }
    A(double x) {
        this(1);
        System.out.println(h);
    }
    A(char c) {
        System.out.println(this.h);
    }
    A(byte c) {
        System.out.println(h);
        System.out.println(h);
    }
    A(short c) {
        Runnable r = () -> System.out.println(h);
        h = 1;
    }
    A(boolean c, int y) {
        int z = h;
        z = b;
    }
    A(float x) {
        init();
        System.out.println(h);
    }
    void init() { h = 1; }
    A(int x, int y) {
        A other = this;
        System.out.println(other.h);
    }
    A(int[] x) {
        h++;
    }
    A(long[] x) {
        h += 2;
    }
    A(char[] x) {
        Object q = s == null ? "x" : s;
    }
    A(Object[] x) {
        if (o == null) o = x;
    }
}
