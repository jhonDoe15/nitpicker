package p;
import java.util.*;
public class Cmp2 {
    public static class Eq { @Override public boolean equals(Object o){return o==this;} @Override public int hashCode(){return 1;} }
    public static abstract class AbsEq { public abstract boolean equals(Object o); }
    public static abstract class AbsEqC { public boolean equals(Object o){return true;} public int hashCode(){return 1;} }
    public static class NoEq { }
    public interface IEq { boolean equals(Object o); }
    // multi-line, annotations
    public static class M1 implements Comparable<M1> {
        @SuppressWarnings("all")
        @Deprecated
        public
        int
        compareTo(
            M1 o)
        {

            int x = 1;
            return x;
        }
    }
    // empty-ish body on its own line
    public static class M2 implements Comparable<M2> {
        public int compareTo(M2 o)
        {
            return 0;
        }
    }
    // bridge case multi-line (param is other class)
    public static class M3 implements Comparable<Top2> {
        int pad;

        public int compareTo(
                Top2 o) {
            return 0;
        }
    }
    // equals from abstract superclass w/ concrete equals
    public static class E1 extends AbsEqC implements Comparable<E1> { public int compareTo(E1 o){return 0;} }
    // equals abstract in superclass (must implement) -> E2 implements
    // abstract class extends NoEq; concrete sub with compareTo
    public static class E3 extends NoEq implements Comparable<E3> { public int compareTo(E3 o){return 0;} }
    // JDK super with equals
    public static class E4 extends ArrayList<String> implements Comparable<E4> { public int compareTo(E4 o){return 0;} }
    // JDK super without equals (Thread)
    public static class E5 extends Thread implements Comparable<E5> { public int compareTo(E5 o){return 0;} }
    // sub of Eq in chain
    public static class E6 extends Eq { public int compareTo(E6 o){return 0;} }
    // equals in interface only
    public static class E7 implements IEq, Comparable<E7> { public int compareTo(E7 o){return 0;} public boolean equals(Object o){return true;} public int hashCode(){return 1;} }
    // E8: equals(Object) overloaded only
    public static class E8 implements Comparable<E8> { public int compareTo(E8 o){return 0;} public boolean equals(E8 o){return true;} }
    // E9: sub of class with compareTo only
    public static class E9 extends Cmp2.E10 { public int compareTo(E10 o){return 5;} }
    public static class E10 implements Comparable<E10> { public int compareTo(E10 o){return 0;} @Override public boolean equals(Object o){return true;} @Override public int hashCode(){return 1;} }
    // E11: abstract class with compareTo, concrete subclass without
    public static abstract class E11 implements Comparable<E11> { public int compareTo(E11 o){return 0;} }
    public static class E12 extends E11 { }
    public static class E13 extends E11 { public int compareTo(E11 o){return 1;} }
    // E14 abstract class with abstract compareTo, concrete sub defines it
    public static abstract class E14 implements Comparable<E14> { }
    public static class E15 extends E14 { public int compareTo(E14 o){return 1;} }
    // E16 non-abstract sub-sub of class with compareTo with equals up
    public static class E16 extends E10 { }
    // E17 inner (non-static) class
    public class E17 implements Comparable<E17> { public int compareTo(E17 o){return 0;} }
    // E18 equals defined in class but as hashCode only
    public static class E18 implements Comparable<E18> { public int compareTo(E18 o){return 0;} public int hashCode(){return 1;} }
    // E19 compareTo(Object) with equals(Object) in generic
    // E20 sub of abstract class with abstract compareTo; self-typed compareTo
    public static class E20<T extends E20<T>> implements Comparable<T> { public int compareTo(T o){return 0;} }
    // E21 compareTo(Self) deprecated / static nested inside interface
    public interface I2 { class Impl implements Comparable<Impl> { public int compareTo(Impl o){return 0;} } }
    // E22 extends abstract class with equals abstract (class declares concrete)
    public static class E22 extends AbsEq implements Comparable<E22> { public boolean equals(Object o){return true;} public int hashCode(){return 1;} public int compareTo(E22 o){return 0;} }
}
class Top2 {}
