package p;
import q.*;
import java.util.*;

public class Cases {
    // 1 field added (instance) -> expect hit
    public static class AddField extends Base { int f; }
    // static field only
    public static class AddStatic extends Base { static int f; }
    // transient only
    public static class AddTransient extends Base { transient int f; }
    // no field at all
    public static class NoField extends Base { void foo() {} }
    // final field
    public static class AddFinal extends Base { final int f = 1; }
    // volatile
    public static class AddVolatile extends Base { volatile int f; }
    // synthetic only: inner (non-static) class has this$0
    public class InnerNonStatic extends Base { }
    // inner non-static with a field
    public class InnerNonStaticF extends Base { int g; }
    // static + instance
    public static class StaticAndInst extends Base { static int s; int i; }
    // overrides equals -> no hit
    public static class Overrides extends Base { int f; @Override public boolean equals(Object o) { return false; } @Override public int hashCode(){return 0;} }
    // overloads equals(Cases) only -> hit?
    public static class Overloads extends Base { int f; public boolean equals(Overloads o) { return false; } }
    // overrides via abstract re-declaration
    public static abstract class AbstractRedecl extends Base { int f; public abstract boolean equals(Object o); }
    // abstract class with field
    public static abstract class AbsField extends Base { int f; }
    // interface extending? (interface can't extend class)
    // enum
    public enum E { A, B; int f; }
    // record
    public record R(int a) {}
    // anonymous
    static Base anon = new Base() { int f; };
    static Object anon2() { return new Base() { int f; }; }
    // local class
    static void local() { class Loc extends Base { int f; } new Loc(); }
    // Mid has no own equals, extends Base: Mid declares field m and doesn't override
    // (Mid is in q)
    public static class FromMid extends Mid { int f; }
    public static class FromMidNoField extends Mid { }
    // JDK superclass
    public static class AL extends ArrayList<String> { int f; }
    public static class HM extends HashMap<String,String> { int f; }
    public static class Thr extends Thread { int f; }
    public static class Exc extends Exception { int f; }
    public static class Obj { int f; }
    public static class ObjExt extends Object { int f; }
    // abstract super equals
    public static class FromAbs extends AbsBase { int f; public boolean equals(Object o){return true;} }
    public static abstract class FromAbsNoAbs extends AbsBase { int f; }
    // final super equals
    public static class FromFinal extends FinalEq { int f; }
    // super no equals
    public static class FromNoEq extends NoEq { int f; }
    // generic
    public static class FromGen extends Gen<String> { int f; }
    public static class GenSub<T> extends Gen<T> { T f; }
    // interface default
    public static class ImplIface implements Iface { int f; }
    // overload only in super
    public static class FromOverload extends EqOverload { int f; }
    // nested base
    public static class FromNested extends PkgPrivBase.Inner { int f; }
    // same-package base (Cases$AddField)
    public static class FromSamePkg extends AddField { int g; }
    // equals is declared but with different return type? skip
    // field of array/long type
    public static class FromBaseArr extends Base { int[] arr; }
    // private equals?? can't override
    // equals in the class but only as static? skip
    // class that has hashCode only
    public static class HashOnly extends Base { int f; @Override public int hashCode() { return 2; } }
    // compareTo doesn't matter
    public static class Cmp extends Base implements Comparable<Cmp> { int f; public int compareTo(Cmp o){return 0;} }
    // extends exception with field & serialVersionUID static
    public static class SerUid extends Base { private static final long serialVersionUID = 1L; }
    // field declared in a deeper subclass with intermediate overriding
    public static class Level1 extends Base { @Override public boolean equals(Object o){return true;} @Override public int hashCode(){return 1;} }
    public static class Level2 extends Level1 { int f; }
}
