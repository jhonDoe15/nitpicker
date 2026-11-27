package p;

import java.util.function.*;

public class A {
    int sw(String s) {
        switch (Integer.valueOf(s)) { case 1: return 1; default: return 0; }
    }
    int cond(String s) {
        if (Integer.valueOf(s) > 3) return 1;
        return 0;
    }
    int comp(String s) {
        int x = 0;
        x += Integer.valueOf(s);
        return x;
    }
    Object ret(String s) { return Integer.valueOf(s); }
    long retl(String s) { return Integer.valueOf(s); }
    void takesInt(int i) {}
    void takesObj(Object i) {}
    void takesLong(long i) {}
    void takesInteger(Integer i) {}
    void arg1(String s) { takesInt(Integer.valueOf(s)); }
    void arg2(String s) { takesObj(Integer.valueOf(s)); }
    void arg3(String s) { takesLong(Integer.valueOf(s)); }
    void arg4(String s) { takesInteger(Integer.valueOf(s)); }
    String cat(String s) { return "a" + Integer.valueOf(s); }
    boolean eq(String s, Integer o) { return Integer.valueOf(s) == o; }
    boolean eq2(String s, int o) { return Integer.valueOf(s) == o; }
    boolean eq3(String s) { return Integer.valueOf(s) == Integer.valueOf(s); }
    int tern(String s, boolean b) { return b ? Integer.valueOf(s) : 0; }
    Integer tern2(String s, boolean b) { return b ? Integer.valueOf(s) : 0; }
    int tern3(String s, boolean b) { return b ? Integer.valueOf(s) : Integer.valueOf(s); }
    int cast(String s) { return (int) Integer.valueOf(s); }
    long cast2(String s) { return (long) Integer.valueOf(s); }
    Object cast3(String s) { return (Object) Integer.valueOf(s); }
    int arr(String s, int[] a) { return a[Integer.valueOf(s)]; }
    int paren(String s) { return (Integer.valueOf(s)); }
    int neg(String s) { return -Integer.valueOf(s); }
    int multi(String s) {
        return Integer
            .valueOf(
                s)
            .intValue();
    }
    int multi2(String s) {
        return
            Integer.valueOf(
                s);
    }
    int multi3(String s) {
        int x = Integer
            .valueOf(s) + 1;
        return x;
    }
    double dd(String s) { return Double.valueOf(s); }
    double dd2(String s) { return Double.valueOf(s) + 1; }
    float ff(String s) { return Float.valueOf(s); }
    double ff2(String s) { return Float.valueOf(s); }
    long ll(String s) { return Long.valueOf(s); }
    float ll2(String s) { return Long.valueOf(s); }
    Supplier<Integer> lam(String s) { return () -> Integer.valueOf(s); }
    IntSupplier lam2(String s) { return () -> Integer.valueOf(s); }
    Function<String,Integer> mr() { return Integer::valueOf; }
    ToIntFunction<String> mr2() { return Integer::valueOf; }
    int forloop(String s) { int t=0; for (int i = 0; i < Integer.valueOf(s); i++) t++; return t; }
    int whl(String s) { int t = 0; while (Integer.valueOf(s) > t) t++; return t; }
    int sh(String s) { return 1 << Integer.valueOf(s); }
    boolean nt(String s) { return !(Integer.valueOf(s) > 1); }
    int incr(String s) { int x = Integer.valueOf(s); return x; }
    int incr2(String s) { Integer x = Integer.valueOf(s); int y = x; return y; }
    int cc(String s) { char c = 'a'; return c + Integer.valueOf(s); }
    String sc(String s) { return "" + Integer.valueOf(s) + 1; }
    String sc2(String s) { return 1 + Integer.valueOf(s) + ""; }
    int assign(String s) { int a; a = Integer.valueOf(s); return a; }
    long assign2(String s) { long a; a = Integer.valueOf(s); return a; }
    Integer assign3(String s) { Integer a; a = Integer.valueOf(s); return a; }
    int arrinit(String s) { int[] a = {Integer.valueOf(s)}; return a[0]; }
    Object[] arrinit2(String s) { Object[] a = {Integer.valueOf(s)}; return a; }
    int[] arrinit3(String s) { return new int[]{Integer.valueOf(s)}; }
    int dim(String s) { return new int[Integer.valueOf(s)].length; }
    int syn(String s) { return Integer.valueOf(s).hashCode(); }
    boolean eqq(String s) { return Integer.valueOf(s).equals(1); }
    int cmp(String s) { return Integer.valueOf(s).compareTo(1); }
    int cmp2(String s) { return Integer.valueOf(s).compareTo(Integer.valueOf(s)); }
}
