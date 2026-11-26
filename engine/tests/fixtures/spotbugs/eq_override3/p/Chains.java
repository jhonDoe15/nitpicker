package p;
import java.util.*;
public class Chains {
    public static class C { public boolean equals(Object o){return o==this;} public int hashCode(){return 1;} }
    public static abstract class AbsNoEq extends C { }
    public static abstract class AbsEq extends C { public boolean equals(Object o){return false;} public int hashCode(){return 1;} }
    public static abstract class AbsAbsEq extends C { public abstract boolean equals(Object o); }
    public static abstract class AbsBase { public boolean equals(Object o){return o==this;} public int hashCode(){return 1;} }
    public static class ConcAbsC extends AbsBase { public boolean equals(Object o){return false;} public int hashCode(){return 2;} }
    public static class ConcAbsD extends AbsBase { }
    public static abstract class AbsAbsNoEq extends AbsBase { }

    // concrete via abstract middle with no equals -> super is C
    public static class S1 extends AbsNoEq { int f; }
    // concrete via abstract middle that overrides equals concretely
    public static class S2 extends AbsEq { int f; }
    // concrete via abstract middle with abstract equals (must implement) -> n/a
    // concrete extends ConcAbsC (concrete, defines equals, parent abstract)
    public static class S3 extends ConcAbsC { int f; }
    // concrete extends ConcAbsD (concrete, no equals; parent abstract w/ equals)
    public static class S4 extends ConcAbsD { int f; }
    // concrete extends AbsAbsNoEq -> abstract with equals up
    public static class S5 extends AbsAbsNoEq { int f; }
    // abstract subject extends concrete w/ field
    public static abstract class S6 extends C { int f; }
    // abstract extends abstract w/ eq w/ field
    public static abstract class S7 extends AbsBase { int f; }
    // nonabstract extending Object-level Number etc
    // interface with default method named equals not allowed. 
    // enum constant body
    public enum En { A { int f; }, B }
    // class with 2 fields in intermediate
    public static class Mid2 extends C { int a; }
    public static class Mid3 extends Mid2 { }       // no field: reported? 
    public static class Mid4 extends Mid2 { int b; } 
    // mid defines field, no equals, sub adds no field; sub-sub adds field
    public static class Mid5 extends Mid3 { int c; }
    // equals declared but static? can't. 
    // equals(Object) with different return? can't.
    // generic equals bridging: equals(T)? 
    // Overload equals(Mid2) in sub
    public static class OvSub extends C { int f; public boolean equals(C o){return true;} }
    // Sub has fields of types: long, String, array, generic
    public static class Fl1 extends C { String s; }
    public static class Fl2 extends C { List<String> l; }
    public static class Fl3 extends C { static final int K = 1; final int k2 = 2; }
    public static class Fl4 extends C { transient int t; static int s; }
    public static class Fl5 extends C { transient int t; int u; }
    public static class Fl6 extends C { static int s; int u; }
    // synthetic field: assert / switch on enum -> $assertionsDisabled static
    public static class Fl7 extends C { void m(int x){ assert x>0; } }
    // inner class (this$0) + transient
    public class Fl8 extends C { transient int t; }
    // lambda capturing, no fields
    public static class Fl9 extends C { Runnable r(){ return () -> {}; } }
    // record can't extend
    // class extends Throwable subclass defined in same file with equals? no
    // interface
    public interface I extends Comparable<I> { }
}
