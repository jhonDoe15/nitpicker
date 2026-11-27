package p;
import java.util.*;
import java.io.Serializable;
public class A implements Comparator<String> {
    public int compare(String a, String b) { return a.compareTo(b); }
}
class B implements Comparator<String>, Serializable {
    public int compare(String a, String b) { return 0; }
}
abstract class C implements Comparator<String> {
    public int compare(String a, String b) { return 0; }
}
interface D extends Comparator<String> {}
class E extends A {}
class F implements D { public int compare(String a, String b) { return 0; } }
class G {
    Comparator<String> anon = new Comparator<String>() { public int compare(String a, String b) { return 0; } };
    Comparator<String> lam = (a, b) -> 0;
    class Inner implements Comparator<Integer> { public int compare(Integer a, Integer b) { return 0; } }
    static class Nested implements Comparator<Integer> { public int compare(Integer a, Integer b) { return 0; } }
    void m() {
        class Local implements Comparator<Integer> { public int compare(Integer a, Integer b) { return 0; } }
        new Local();
    }
}
enum H implements Comparator<String> { X; public int compare(String a, String b) { return 0; } }
class I implements Comparator<String> {
    private final int k = 3;
    public int compare(String a, String b) { return k; }
}
class J implements Comparator<String> {
    static int s;
    public int compare(String a, String b) { return s; }
}
class K implements Comparator { public int compare(Object a, Object b) { return 0; } }
record R(int x) implements Comparator<String> { public int compare(String a, String b) { return 0; } }
class M implements Comparator<String> {
    public int compare(String a, String b) { return 0; }
    public boolean equals(Object o) { return false; }
}
class N implements Comparable<N> { public int compareTo(N o) { return 0; } }
class M2 implements Comparator<String> {
    public int compare(String a, String b) { return 0; }
    public int hashCode() { return 1; }
}
class M3 implements Comparator<String> {
    public int compare(String a, String b) { return 0; }
    public void other() {}
}
class M4 implements Comparator<String> {
    public int compare(String a, String b) { return 0; }
    public boolean equals(M4 o) { return false; }
}
class M5 extends M { }
class M6 implements Comparator<String> {
    public int compare(String a, String b) { return 0; }
    public static boolean equals(Object a, Object b) { return false; }
}
abstract class Q implements Comparator<String> { public boolean equals(Object o) { return true; } }
class Q2 extends Q { public int compare(String a, String b) { return 0; } }
class S implements java.io.Externalizable, Comparator<String> {
    public int compare(String a, String b) { return 0; }
    public void writeExternal(java.io.ObjectOutput o) {}
    public void readExternal(java.io.ObjectInput o) {}
}
class T extends B {}
class U implements Comparator<String> {
    public int compare(String a, String b) { return 0; }
    public U(int x) {}
    public U() {}
}
