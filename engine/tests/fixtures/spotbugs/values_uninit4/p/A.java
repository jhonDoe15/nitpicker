package p;

import java.util.*;

public class A {
    List<String> list;
    String s;
    int[] arr;
    Object o;

    A(String x, byte t) { System.out.println(s); s = x; }
    A(String x, short t) { s.length(); s = x; }
    A(List<String> x, byte t) { System.out.println(list); list = x; }
    A(List<String> x, short t) { list.add("a"); list = new ArrayList<>(); }
    A(List<String> x, char t) { list.add("a"); this.list = x; }
    A(String x, char t) { s.length(); s = "q"; }
    A(String x, long t) { s.length(); o = x; }
    A(int[] x, byte t) { int a = arr[0]; arr = x; }
    A(int[] x, short t) { int a = arr.length; arr = x; }
    A(String x, float t) { String y = x; s.length(); s = y; }
    A(String x, double t) { s.length(); if (t > 0) s = x; }
    A(String x, int t) { s.length(); s = x.trim(); }
}
