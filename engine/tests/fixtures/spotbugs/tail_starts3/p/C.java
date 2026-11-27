package p;
public sealed class C permits D { public C() { new Thread().start(); } }
final class D extends C {}
