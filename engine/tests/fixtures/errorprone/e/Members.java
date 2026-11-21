package e;

import java.util.Iterator;
import java.util.List;
import java.util.Map;

public abstract class Members implements Iterable<String>, Runnable {
    void first(int a) {}

    void second() {}

    void first(int a, String b) {}

    void third() {}

    void first(String b, int a, long c) {}

    public Iterator<String> iterator() {
        return null;
    }

    public void run() {}

    public abstract String toString();

    void place(String key, int index) {}

    void place(int index, String key, List<? super Number> values) {}

    void place(Map<String, ? extends Number> map, int index, String key, int... rest) {}

    static class Utility {
        static final int SIZE = 1;

        static int size() {
            return SIZE;
        }
    }

    static class Holder {
        static int size() {
            return 1;
        }

        int own;
    }

    static final class Closed {
        private Closed() {}

        static void help() {}
    }

    interface Shape {
        double area();

        default String label() {
            return "shape";
        }
    }

    static class Square implements Shape {
        public double area() {
            return 1;
        }

        public String label() {
            return "square";
        }

        @Override
        public String toString() {
            return label();
        }
    }

    record Point(int x, int y) {
        Point(int y, long x, int z) {
            this((int) x, y);
        }

        public int x() {
            return x;
        }
    }

    @SuppressWarnings("all")
    static class Silent {
        public String toString() {
            return "";
        }
    }
}
