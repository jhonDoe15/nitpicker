package p;
public sealed class C2 permits D2 { public C2() { new Thread().start(); } }
non-sealed class D2 extends C2 {}
