package p;
public record R(int x) { public static int cnt; public R { cnt++; } void m() { int q = cnt; } }
