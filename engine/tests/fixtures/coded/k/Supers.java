package k;

interface Limits {
    int MAX = 3;
}

class Outer {
    static class Base {
        private int count;
        private int unused;
        int shared;
    }

    static class Sub extends Base implements Limits {
        private int own;

        int direct() {
            return super.shared;
        }

        class Inner {
            int read() {
                return Sub.super.count + Sub.super.shared + Sub.super.MAX;
            }
        }
    }

    static class Leaf extends Sub {
        private int own = 1;

        int read() {
            return Leaf.super.own;
        }
    }
}
