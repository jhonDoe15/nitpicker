package p;

import java.util.Iterator;

public class H3 {
    static class A implements Iterator<Object> {
        A other;

        public boolean hasNext() {
            return other.next() != null;
        }

        public Object next() {
            return null;
        }
    }

    static class B implements Iterator<Object> {
        public boolean hasNext() {
            return next(1) != null;
        }

        public Object next(int x) {
            return null;
        }

        public Object next() {
            return null;
        }
    }

    static class C implements Iterator<Object> {
        public boolean hasNext() {
            java.util.function.Supplier<Object> r = () -> next();
            return r != null;
        }

        public Object next() {
            throw new java.util.NoSuchElementException();
        }
    }

    static class D implements Iterator<Object> {
        public boolean hasNext() {
            return new D().next() != null;
        }

        public Object next() {
            return null;
        }
    }

    static class E implements Iterator<Object> {
        public boolean hasNext(int x) {
            return next() != null;
        }

        public boolean hasNext() {
            return false;
        }

        public Object next() {
            return null;
        }
    }

    static class G implements Iterator<Object> {
        public boolean hasNext() {
            return next() != null && next() != null;
        }

        public Object next() {
            return null;
        }
    }

    static class I implements Iterator<Object> {
        public Boolean hasNext2() {
            return next() != null;
        }

        public boolean hasNext() {
            return super.toString() != null && I.this.next() != null;
        }

        public Object next() {
            return null;
        }
    }

    static class J implements Iterator<Object> {
        public static boolean hasNext(J j) {
            return j.next() != null;
        }

        public boolean hasNext() {
            return true;
        }

        public Object next() {
            return null;
        }
    }
}
