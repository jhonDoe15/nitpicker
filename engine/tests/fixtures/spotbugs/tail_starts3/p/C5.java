package p;
public sealed class C5 permits D5 { public C5() { new Thread().start(); } }
sealed class D5 extends C5 permits E5 {}
final class E5 extends D5 {}
