package p;

public class A {
    Thread t; int n;
    public A() { t = new Thread(); t.start(); n = 1; }
    protected A(int x) { new Thread().start(); }
    A(long x) { new Thread().start(); }
    private A(char x) { new Thread().start(); }
    public A(String s) { new Thread().start(); new Thread().start(); }
    public A(double d) { new Thread().start(); int k = 1; }
    public A(float f) { new Thread().start(); if (f > 0) { n = 2; } }
    public A(Object o) { this(); new Thread().start(); }
    public A(byte b) { new Thread().start(); return; }
    public A(short s) { if (s > 0) { new Thread().start(); } }
    public A(boolean b) { try { new Thread().start(); } catch (RuntimeException e) { } }
    public A(int[] a) { Runnable r = () -> new Thread().start(); r.run(); }
    public A(int a, int b) { new Thread().start(); super.toString(); }
    public static class N { public N() { new Thread().start(); } }
    static class M { public M() { new Thread().start(); } }
    public final class F { public F() { new Thread().start(); } }
    public class I { public I() { new Thread().start(); } }
    public static class Q extends Thread { public Q() { start(); } }
    public static class R extends Thread { public R() { this.start(); n2(); } void n2() {} }
    public abstract static class S { public S() { new Thread().start(); } }
    public enum E { X; E() { new Thread().start(); } }
    public static class U { public U() { Thread th = new Thread(); th.setDaemon(true); th.start(); } }
    public static class V { public V(Thread th) { th.start(); th.interrupt(); } }
    public static class W { private final Thread th = new Thread(); public W() { th.start(); } }
    public static class X { private final Thread th; public X() { th = new Thread(); th.start(); th.setName("a"); } }
    public static class Y { public Y() { java.util.concurrent.Executors.newSingleThreadExecutor().submit(() -> {}); } }
}
