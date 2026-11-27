package p;
public abstract sealed class C6 permits D6 { public C6() { new Thread().start(); } }
final class D6 extends C6 {}
