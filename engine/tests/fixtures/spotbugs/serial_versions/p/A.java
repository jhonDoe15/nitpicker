package p;
import java.io.*;
import java.util.*;
class A1 implements Serializable { private void readObject(ObjectInputStream s) throws IOException, ClassNotFoundException {} }
class A2 implements Serializable { private void writeObject(ObjectOutputStream s) throws IOException {} }
class A3 implements Serializable { private Object readResolve() { return this; } }
class A4 implements Serializable { private Object writeReplace() { return this; } }
class A5 implements Serializable { private static transient int x; }
class A6 implements Serializable { private transient int x; }
class A7 implements Serializable { private static final ObjectStreamField[] serialPersistentFields = {}; }
class B1 extends Exception { }
class B2 extends RuntimeException { int x; }
class B3 extends Error { }
class B4 extends Throwable { }
class B5 extends HashMap<String,String> { }
class B6 extends A6 { }
class B7 extends A6 { private transient int y; }
abstract class B8 implements Serializable { private transient int y; }
final class B9 implements Serializable { }
public class A implements Serializable { static class N implements Serializable { private transient int x; } class I implements Serializable { } Object a = new Serializable() { private transient int x; }; void m() { class Loc implements Serializable { } } }
enum E { X; private transient int z; }
record R(int a) implements Serializable {}
class C1 implements Serializable { private int serialVersionUID; }
class C2 implements Serializable { static long serialVersionUID = 1; }
class C3 implements Serializable { static final int serialVersionUID = 1; }
class C4 implements Serializable { final long serialVersionUID = 1; }
class C5 implements Serializable { private static final Long serialVersionUID = 1L; }
interface I1 extends Serializable { long serialVersionUID = 1L; }
class C6 implements I1 { }
class C7 extends B1 { private transient int x; }
class C8 implements Externalizable { public C8() {} private transient int x; public void writeExternal(ObjectOutput o) {} public void readExternal(ObjectInput i) {} }
class C9 implements Comparator<String>, Serializable { public int compare(String a, String b) { return 0; } }
