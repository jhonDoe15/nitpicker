package p;
import java.util.*;
import java.io.*;
import java.text.Collator;
import java.util.concurrent.*;

public class A {
    @interface SuppressFBWarnings { String[] value() default {}; }
    static class N1 implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    class In1 implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    static class Ser implements Comparator<String>, Serializable { public int compare(String a, String b) { return 0; } }
    static class SubSer extends Ser { }
    static class Ext implements Comparator<String>, Externalizable {
        public int compare(String a, String b) { return 0; }
        public void writeExternal(ObjectOutput o) {}
        public void readExternal(ObjectInput i) {}
    }
    static class Coll extends Collator { public int compare(String a, String b) { return 0; } public int hashCode(){return 0;} public java.text.CollationKey getCollationKey(String s){return null;} }
    static class Fld implements Comparator<String> { Comparator<String> c; public int compare(String a, String b) { return 0; } }
    static class FldArr implements Comparator<String> { Comparator<String>[] c; public int compare(String a, String b) { return 0; } }
    static class FldList implements Comparator<String> { List<Comparator<String>> c; public int compare(String a, String b) { return 0; } }
    static class FldSub implements Comparator<String> { Ser c; public int compare(String a, String b) { return 0; } }
    static class FldSt implements Comparator<String> { static Comparator<String> c; public int compare(String a, String b) { return 0; } }
    static class FldRaw implements Comparator<String> { Collator c; public int compare(String a, String b) { return 0; } }
    static class FldLocal implements Comparator<String> { transient Comparator<String> c; public int compare(String a, String b) { return 0; } }
    static class FldRetInner implements Comparator<String> { Comparator<String>[][] c; public int compare(String a, String b) { return 0; } }
    @SuppressFBWarnings("SE_COMPARATOR_SHOULD_BE_SERIALIZABLE")
    static class Sup implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    @SuppressFBWarnings
    static class Sup2 implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    @Deprecated
    @SuppressWarnings("x")
    static
    class Ann implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    record R(int x) implements Comparator<String> { public int compare(String a, String b) { return 0; } }
    record R2<T>(int x) implements Comparator<T> { public int compare(T a, T b) { return 0; } }
    static class G<T> implements Comparator<T> { public int compare(T a, T b) { return 0; } }
    static class CQ implements ConcurrentMap<String,String> { 
      public int size(){return 0;} public boolean isEmpty(){return true;} public boolean containsKey(Object o){return false;} public boolean containsValue(Object o){return false;} public String get(Object o){return null;} public String put(String a,String b){return null;} public String remove(Object o){return null;} public void putAll(Map<? extends String,? extends String> m){} public void clear(){} public Set<String> keySet(){return null;} public Collection<String> values(){return null;} public Set<Map.Entry<String,String>> entrySet(){return null;} public String putIfAbsent(String a,String b){return null;} public boolean remove(Object a,Object b){return false;} public boolean replace(String a,String b,String c){return false;} public String replace(String a,String b){return null;}
    }
    static class Anon0 { Comparator<String> c = new Comparator<String>() { public int compare(String a, String b) { return 0; }
         class Mem implements Comparator<String> { public int compare(String a, String b) { return 0; } } }; }
    enum E { X { public int compare(String a, String b) { return 0; } }; public int compare(String a, String b) { return 0; } }
    enum E2 implements Comparator<String> { X, Y { }; public int compare(String a, String b) { return 0; } }
    void m() {
        class Loc implements Comparator<String> { public int compare(String a, String b) { return 0; } }
        Runnable r = () -> { class InL implements Comparator<String> { public int compare(String a, String b) { return 0; } } };
        Runnable r2 = () -> { Object o = new Comparator<String>() { public int compare(String a, String b) { return 0; } 
           class Deep implements Comparator<String> { public int compare(String a, String b) { return 0; } } }; };
    }
    interface I extends Comparator<String> {}
    static abstract class Abs implements I {}
    static class FromI implements I { public int compare(String a, String b) { return 0; } }
    static class CI extends String_CI {}
    static class String_CI implements Comparator<String> { public int compare(String a, String b) { return 0; } }
}
class Top1 implements Comparator<String> { public int compare(String a, String b) { return 0; } }
final class Top2 implements java.util.Comparator<String> { public int compare(String a, String b) { return 0; } }
class Top3 extends java.util.concurrent.ConcurrentSkipListMap<String,String> { }
class Top4
   implements Comparator<String> { public int compare(String a, String b) { return 0; } }
/** doc */
@FunctionalInterface interface Fi extends Comparator<String> {}
class Top5 implements Fi { public int compare(String a, String b) { return 0; } }
