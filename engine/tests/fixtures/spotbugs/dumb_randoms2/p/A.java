package p;
import java.util.*; import java.util.concurrent.ThreadLocalRandom; import java.security.SecureRandom;
public class A {
    static class R extends Random { } int[] arr = new int[10]; List<String> list;
    Object c1(Object o, int n) { return arr[o.hashCode() % n]; }
    Object c2(Object o) { return arr[o.hashCode() % 10]; }
    Object c3(Random r, int n) { return arr[r.nextInt() % n]; }
    Object c4(Random r) { return arr[r.nextInt() % 10]; }
    Object c5(Object o, int n) { return list.get(o.hashCode() % n); }
    Object c6(Object o, int[] a) { return a[o.hashCode() % a.length]; }
    Object c7(Object o, int[] a) { return a[Math.abs(o.hashCode() % a.length)]; }
    Object c8(Object o, int[] a) { return a[o.hashCode() % 8]; }
    Object c9(Object o, int[] a) { int i = o.hashCode() % a.length; return a[i]; }
    Object c10(Object o, long[] a) { return a[(int) (o.hashCode() % 10L)]; }
    Object c11(R r) { return Math.abs(r.nextInt()); }
    Object c12(SplittableRandom r) { return Math.abs(r.nextInt()); }
    Object c13(ThreadLocalRandom r) { return (int) r.nextDouble(); }
    Object c14(SecureRandom r) { return (int) r.nextDouble(); }
    Object c15(R r) { return (int) r.nextDouble(); }
    Object c16(ThreadLocalRandom r) { return (int) (r.nextDouble() * 5); }
    Object c17(R r) { return (int) (r.nextDouble() * 5); }
    Object c18(Object o) { return StrictMath.abs(o.hashCode()); }
    Object c19(Random r) { return StrictMath.abs(r.nextInt()); }
    Object c20(Random r) { return Math.absExact(r.nextInt()); }
    Object c21(SplittableRandom r) { return (int) r.nextDouble(); }
    Object c22(Object o, int[] a) { return a[o.hashCode() % 1]; }
    Object c23(Random r, int[] a) { return a[r.nextInt() % a.length]; }
}
