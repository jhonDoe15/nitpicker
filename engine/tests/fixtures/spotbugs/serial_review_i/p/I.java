package p;
import java.io.Serializable;
public enum I {
    X { Thread t = new Thread(); Object readResolve() { return this; } public String toString() { return t.getName(); } },
    Y { Thread t = new Thread(); public String toString() { return t.getName(); } };
    class Mem implements Serializable { Thread t; }
    static class SMem implements Serializable { Thread t; }
}
