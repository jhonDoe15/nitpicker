package p;
import java.io.*;
import java.util.*;
public class A implements Serializable {
    private int x;
    private Object o;
    private List<String> list;
    private ArrayList<String> alist;
    private Thread thread;
    private transient Thread t2;
    private static Thread st;
    private Runnable r;
    private Map<String, Object> map;
    private String s;
    private InputStream in;
    private Comparable<String> cmp;
    private Number num;
    private B b;
    private C c;
    private final Thread ft = null;
    private Optional<String> opt;
    private Object[] arr;
    private Thread[] tarr;
    private Iterator<String> it;
}
class B {}
class C implements Serializable { private Thread t; }
class D implements Serializable { }
class E extends C { private Thread e; }
abstract class F implements Serializable { private Thread f; }
interface G extends Serializable {}
class H implements G { private Thread h; static final long serialVersionUID = 1L; }
class I implements Serializable { private static final long serialVersionUID = 1L; }
class J implements Serializable { long serialVersionUID = 1L; }
class K implements Externalizable { private Thread k; public void writeExternal(ObjectOutput o) {} public void readExternal(ObjectInput i) {} }
class L implements Serializable { private Thread l; private void writeObject(ObjectOutputStream s) throws IOException {} }
class M implements Serializable { private Thread m; private void readObject(ObjectInputStream s) throws IOException {} }
enum N { X; private Thread n; }
record R(Thread t) implements Serializable {}
class O extends Exception { private Thread o; }
class P extends ArrayList<String> { private Thread p; }
class Q implements Serializable { class Inner implements Serializable { Thread i; } static class Nested implements Serializable { Thread n; } }
class S implements Serializable { Object anon = new Serializable() { Thread a; }; }
