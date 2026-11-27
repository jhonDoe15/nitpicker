package p;

import java.util.Iterator;

public class H {
    @SuppressWarnings("rawtypes")
    static class Raw implements Iterator {
        public boolean hasNext() {
            return next() != null;
        }

        public Object next() {
            return "x";
        }
    }

    static class Obj implements Iterator<Object> {
        public boolean hasNext() {
            return next() != null;
        }

        public Object next() {
            return "x";
        }
    }

    static class NoIt {
        public boolean hasNext() {
            return next() != null;
        }

        public Object next() {
            return "x";
        }
    }

    abstract static class Abs implements Iterator<Object> {
        public boolean hasNext() {
            return next() != null;
        }
    }

    static class Other implements Iterator<Object> {
        Iterator<Object> in;

        public boolean hasNext() {
            return in.next() != null;
        }

        public Object next() {
            return null;
        }
    }

    static class Str implements Iterator<String> {
        public boolean hasNext() {
            return next() != null;
        }

        public String next() {
            return "x";
        }
    }

    static class Bridge implements Iterator<String> {
        public boolean hasNext() {
            Iterator<String> me = this;
            return me.next() != null;
        }

        public String next() {
            return "x";
        }
    }

    static class Enum implements java.util.Enumeration<Object> {
        public boolean hasMoreElements() {
            return nextElement() != null;
        }

        public Object nextElement() {
            return null;
        }
    }

    static class ListIt implements java.util.ListIterator<Object> {
        public boolean hasNext() {
            return next() != null;
        }

        public Object next() {
            return null;
        }

        public boolean hasPrevious() {
            return false;
        }

        public Object previous() {
            return null;
        }

        public int nextIndex() {
            return 0;
        }

        public int previousIndex() {
            return 0;
        }

        public void remove() {
        }

        public void set(Object o) {
        }

        public void add(Object o) {
        }
    }
}
