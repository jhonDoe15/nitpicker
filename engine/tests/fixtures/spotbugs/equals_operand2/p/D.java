package p;
import java.util.*;
import java.util.concurrent.*;
import java.io.Serializable;
import q.Q;
public class D {
    int v;
    // interface origin / priority
    static class I1 { public boolean equals(Object o) { return o instanceof List; } }
    static class I2 { public boolean equals(Object o) { return o instanceof Callable; } }
    static class I3 { public boolean equals(Object o) { return o instanceof CharSequence; } }
    static class I4 { public boolean equals(Object o) { return o instanceof Map.Entry; } }
    static class I5 { public boolean equals(Object o) { return o instanceof Serializable; } }
    static class I6 { public boolean equals(Object o) { return o instanceof Q.QI; } }
    static class I7 { public boolean equals(Object o) { return o instanceof ConcurrentMap; } }
    static class I8 { public boolean equals(Object o) { return o instanceof Q.In; } }
    static class I9 { public boolean equals(Object o) { return o instanceof Q.QF; } }
    static class I10 { public boolean equals(Object o) { return o instanceof Q.QE; } }
    static class I11 { public boolean equals(Object o) { return o instanceof Q.QR; } }
    static final class I12 { public boolean equals(Object o) { return o instanceof CharSequence; } }
    static abstract class I13 { public boolean equals(Object o) { return o instanceof CharSequence; } }
    record I15(int a) { public boolean equals(Object o) { return o instanceof CharSequence; } }
    static class I16 { public boolean equals(Object o) { return o instanceof int[]; } }
    static class I17 { public boolean equals(Object o) { return o instanceof String[][]; } }
    static class I18 { public boolean equals(Object o) { return o instanceof Q.QI[]; } }
    static class I19 { public boolean equals(Object o) { return o instanceof List<?> l; } }
    static class I20 { public boolean equals(Object o) { return o instanceof java.util.AbstractList<?>; } }
    static class I21<T> { public boolean equals(Object o) { return o instanceof Comparable<?>; } }
    static class I22<T extends Number> { public boolean equals(Object o) { T t = (T) o; return t == null; } }
    static class I23<T> { public boolean equals(Object o) { return o instanceof I23<?> x && x.v == 1; } int v; }
    static class I24 extends ArrayList<String> { public boolean equals(Object o) { return o instanceof List; } }
    static class I25 extends ArrayList<String> { public boolean equals(Object o) { return o instanceof Set; } }
    static class I26 extends ArrayList<String> { public boolean equals(Object o) { return o instanceof Collection; } }
    static class I27 extends ArrayList<String> { public boolean equals(Object o) { return o instanceof LinkedList; } }
    static class I28 extends ArrayList<String> { public boolean equals(Object o) { return o instanceof RandomAccess; } }
    static class I29 implements Runnable { public void run(){} public boolean equals(Object o) { return o instanceof Callable; } }
    static class I30 { public boolean equals(Object o) { return o instanceof Thread.State; } }
    static class I31 { public boolean equals(Object o) { return o instanceof java.util.concurrent.locks.Lock; } }
    static class I32 { public boolean equals(Object o) { return o instanceof java.util.function.Function; } }
    static class I33 { public boolean equals(Object o) { return o instanceof Number; } }
    static class I34 { public boolean equals(Object o) { return o instanceof java.lang.Comparable; } }
    static class I35 { public boolean equals(Object o) { return o instanceof Map.Entry<?,?>; } }
    static class I36 { public boolean equals(Object o) { return o instanceof java.sql.Date; } }
    static class I37 { public boolean equals(Object o) { return o instanceof D; } }
    static class I38 { public boolean equals(Object o) { return o instanceof D.I1; } }
    static class I39 { public boolean equals(Object o) { return o instanceof Void; } }
    static class I40 { public boolean equals(Object o) { return o instanceof Runnable; } }
}
