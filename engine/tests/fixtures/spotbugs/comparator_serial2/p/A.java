package p;
import java.util.*;
public class A {
    static void m() {
        class Local implements Comparator<Integer> { public int compare(Integer a, Integer b) { return 0; } }
        new Local();
    }
    Object o = new Object() {
        class InAnon implements Comparator<Integer> { public int compare(Integer a, Integer b) { return 0; } }
    };
    static Comparator<String> c = new Comparator<String>() {
        public int compare(String a, String b) { return 0; }
    };
}
class Coll extends java.text.RuleBasedCollator {
    Coll() throws Exception { super("< a"); }
}
class Wild implements Comparator<Object>, Cloneable {
    public int compare(Object a, Object b) { return 0; }
}
@SuppressFBWarnings("SE_COMPARATOR_SHOULD_BE_SERIALIZABLE")
class Sup implements Comparator<Object> {
    public int compare(Object a, Object b) { return 0; }
}
class Gen<T> implements Comparator<T> {
    public int compare(T a, T b) { return 0; }
}
final class Fin implements Comparator<String> {
    private Fin() {}
    public int compare(String a, String b) { return 0; }
}
@interface SuppressFBWarnings { String[] value() default {}; }
