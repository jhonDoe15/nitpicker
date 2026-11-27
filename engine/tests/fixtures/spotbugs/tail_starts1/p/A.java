package p;

public class A {
    T t;
    public A() { t = new T(); t.start(); }
    public A(int x) { T v = new T(); v.start(); System.out.println(); }
    public A(Thread th) { th.start(); }
    public A(String s) { new Thread().start(); }
    static class T extends Thread { }
}
final class B {
    A.T t;
    public B() { t = new A.T(); t.start(); }
}
class C extends Thread {
    public C() { start(); }
}
class D {
    public D() { new Thread(() -> {}).start(); }
    protected D(int i) { new Thread(() -> {}).start(); }
}
