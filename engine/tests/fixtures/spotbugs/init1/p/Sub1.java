package p;

public class Sub1 extends S1 {
    static int counter;
    static Sub1 make() { return new Sub1(); }
    static class Deeper extends Sub1 { }
}
