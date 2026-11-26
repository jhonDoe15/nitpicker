package p;
import java.util.*;
public class A {
    public Object o1;
    public List<String> l1;
    public Date d1;
    public int[] ar;
    public Thread.State en;
    public A self;
    public Runnable r;
    public double dd;
    public short sh;
    public byte by;
    public float fl;
    public Long lo;
    public CharSequence cs;
    public int inc;
    public int comp;
    public int lam;
    public int other;
    public int twice;
    public int fromStatic;
    public int anon;
    void s1() {
        o1 = new Object(); l1 = new ArrayList<>(); d1 = new Date(); ar = new int[1]; en = null; self = this; r = null;
        dd = 1; sh = 1; by = 1; fl = 1; lo = 1L; cs = "";
        inc++;
        comp += 2;
        Runnable q = () -> lam = 1;
        A x = new A(); x.other = 1;
    }
    void s2() { twice = 2; }
    void s0() { twice = 1; }
    static void st(A a) { a.fromStatic = 1; }
    void an() { new Object() { void w() { anon = 1; } }; }
}
