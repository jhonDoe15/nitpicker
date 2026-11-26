package p;
import java.io.Serializable;
public class A {
    public static class Base implements Serializable { private static final long serialVersionUID = 1L; }
    static Object make() {
        return new Base() { Thread t = new Thread(); public String toString() { return t.getName(); } };
    }
    static Object local() {
        class Loc extends Base { Thread t = new Thread(); public String toString() { return t.getName(); } }
        return new Loc();
    }
    Object inst() {
        return new Base() { Thread t = new Thread(); public String toString() { return t.getName(); } };
    }
    enum E {
        X { Thread t = new Thread(); public String toString() { return t.getName(); } };
    }
    public static class Box<T> implements Serializable { private static final long serialVersionUID = 1L; T v; }
    public static class Holder implements Serializable {
        private static final long serialVersionUID = 1L;
        Box<Thread> b = new Box<>();
        Thread th;
    }
    public static class Ver implements Serializable {
        static final long[] serialVersionUID = {1L};
        transient int x;
    }
    public record R(int a) implements Serializable {
        class In implements Serializable { Thread t; }
    }
    public interface Itf {
        class InI implements Serializable { Thread t; }
    }
}
