package p;
import java.util.*;
public class Cmp {
    // 1 basic
    public static class A1 implements Comparable<A1> { public int compareTo(A1 o) { return 0; } }
    // 2 with equals override
    public static class A2 implements Comparable<A2> { public int compareTo(A2 o) { return 0; } @Override public boolean equals(Object o){return true;} @Override public int hashCode(){return 1;} }
    // 3 raw Comparable
    public static class A3 implements Comparable { public int compareTo(Object o) { return 0; } }
    // 4 compareTo without implementing Comparable
    public static class A4 { public int compareTo(A4 o) { return 0; } }
    // 5 compareTo(Object) without Comparable
    public static class A5 { public int compareTo(Object o) { return 0; } }
    // 6 abstract class
    public static abstract class A6 implements Comparable<A6> { public int compareTo(A6 o) { return 0; } }
    // 7 abstract compareTo
    public static abstract class A7 implements Comparable<A7> { public abstract int compareTo(A7 o); }
    // 8 interface with default compareTo
    public interface A8 extends Comparable<A8> { default int compareTo(A8 o) { return 0; } }
    // 9 enum
    public enum A9 implements Comparable<A9> { X; }
    // 10 record
    public record A10(int a) implements Comparable<A10> { public int compareTo(A10 o){return 0;} }
    // 11 inherited compareTo (sub doesn't define)
    public static class A11 extends A1 { }
    // 12 sub defines compareTo bridging, inherits Object.equals
    public static class A12 extends A1 { public int compareTo(A1 o){return 1;} }
    // 13 super defines equals, sub defines compareTo
    public static class A13 extends q.EqBase implements Comparable<A13> { public int compareTo(A13 o){return 0;} }
    // 14 compareTo with different param types
    public static class A14 implements Comparable<String> { public int compareTo(String o){return 0;} }
    // 15 compareTo returning long (not int)
    public static class A15 { public long compareTo(A15 o){return 0;} }
    // 16 compareTo static
    public static class A16 { public static int compareTo(A16 o){return 0;} }
    // 17 compareTo two args
    public static class A17 { public int compareTo(A17 o, A17 p){return 0;} }
    // 18 private compareTo
    public static class A18 { private int compareTo(A18 o){return 0;} }
    // 19 compareTo(Object) impl Comparable<A19>? (compile error) skip
    // 20 compareTo returns boolean? 
    public static class A20 { public boolean compareTo(A20 o){return true;} }
    // 21 anonymous
    static Object anon = new Comparable<Object>() { public int compareTo(Object o){return 0;} };
    // 22 generic class
    public static class A22<T> implements Comparable<A22<T>> { public int compareTo(A22<T> o) { return 0; } }
    // 23 param is a nested type from another class
    public static class A23 { public int compareTo(q.Other.In o) { return 0; } }
    // 24 param is List, int[]
    public static class A24 { public int compareTo(List<String> o) { return 0; } public int compareTo(int[] a){return 0;} }
    // 25 param is int primitive
    public static class A25 { public int compareTo(int o) { return 0; } }
    // 26 param in same package top-level
    public static class A26 implements Comparable<Top> { public int compareTo(Top o) { return 0; } }
    // 27 param other package class
    public static class A27 implements Comparable<q.QBase> { public int compareTo(q.QBase o) { return 0; } }
    // 28 param JDK class
    public static class A28 implements Comparable<java.util.Date> { public int compareTo(java.util.Date o) { return 0; } }
    // 29 extends class with compareTo and equals via Comparable super
    public static class A29 extends q.QBase { }
    public static class A30 extends q.QBase { public int compareTo(q.QBase o){return 1;} }
    // 31 final / synchronized / deprecated
    public static class A31 implements Comparable<A31> { public final synchronized int compareTo(A31 o) { return 0; } }
    // 32 equals only overloaded
    public static class A32 implements Comparable<A32> { public int compareTo(A32 o) { return 0; } public boolean equals(A32 o){return true;} }
    // 33 two compareTo
    public static class A33 implements Comparable<A33> { public int compareTo(A33 o) { return 0; } public int compareTo(String s) { return 0; } }
}
class Top implements Comparable<Top> { public int compareTo(Top o) { return 0; } }
