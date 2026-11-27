package p;

import java.util.Iterator;

public class F {
    static class A implements Iterator<String> {
        public boolean hasNext() {
            return next() != null;
        }

        public String next() {
            return "x";
        }
    }

    static class B implements Iterator<String> {
        private int i;

        public boolean hasNext() {
            next();
            return i < 3;
        }

        public String next() {
            i++;
            return "x";
        }
    }

    static class C implements Iterator<String> {
        Iterator<String> in;

        public boolean hasNext() {
            return in.next() != null;
        }

        public String next() {
            return in.next();
        }
    }

    static class D {
        public boolean hasNext() {
            return next() != null;
        }

        public String next() {
            return "x";
        }
    }

    static class E implements Iterator<String> {
        public boolean hasNext() {
            return this.next() != null;
        }

        public String next() {
            return null;
        }
    }
}
