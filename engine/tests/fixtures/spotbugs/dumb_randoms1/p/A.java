package p;
import java.util.*; import java.util.concurrent.ThreadLocalRandom; import java.security.SecureRandom;
public class A {
    Random fr = new Random(); Object fo;
    Object c1(Random r) { return Math.abs(r.nextInt()); }
    Object c2(Random r) { return Math.abs(r.nextLong()); }
    Object c3(Random r, int n) { return Math.abs(r.nextInt(n)); }
    Object c4(Random r) { return Math.abs(r.nextDouble()); }
    Object c5(SecureRandom r) { return Math.abs(r.nextInt()); }
    Object c6(ThreadLocalRandom r) { return Math.abs(r.nextInt()); }
    Object c7(Object o) { return Math.abs(o.hashCode()); }
    Object c8(String s) { return Math.abs(s.hashCode()); }
    Object c9(Object o) { return Math.abs(System.identityHashCode(o)); }
    Object c10(Object o) { return Math.abs(Objects.hashCode(o)); }
    Object c11(Object o) { return Math.abs(Objects.hash(o)); }
    Object c12(Object o) { return Math.abs(Arrays.hashCode(new int[0])); }
    Object c13(Integer o) { return Math.abs(o.hashCode()); }
    Object c14(Object o) { return Math.abs((long) o.hashCode()); }
    Object c15(Object o) { return Math.abs(o.hashCode()) % 7; }
    Object c16(Random r) { return Math.abs(r.nextInt()) % 7; }
    Object c17(Object o, int n) { return o.hashCode() % n; }
    Object c18(Object o) { return o.hashCode() % 7; }
    Object c19(Object o) { return o.hashCode() % 8; }
    Object c20(Object o) { return o.hashCode() % 2; }
    Object c21(Object o) { return o.hashCode() % 1; }
    Object c22(Random r, int n) { return r.nextInt() % n; }
    Object c23(Random r) { return r.nextInt() % 10; }
    Object c24(Random r) { return r.nextInt() % 16; }
    Object c25(Random r) { return r.nextLong() % 10; }
    Object c26(Random r) { return r.nextInt(5) % 3; }
    Object c27(Object o, int n) { return Math.abs(o.hashCode() % n); }
    Object c28(Object o, int n) { return Math.floorMod(o.hashCode(), n); }
    Object c29(Object o, int n) { return (o.hashCode() & 0x7fffffff) % n; }
    Object c30(Object o, int n) { int h = o.hashCode(); return h % n; }
    Object c31(Object o) { int h = o.hashCode(); return Math.abs(h); }
    Object c32(int n) { return fo.hashCode() % n; }
    Object c33(int n) { return fr.nextInt() % n; }
    Object c34(int n) { return hashCode() % n; }
    Object c35(int n) { return Math.abs(hashCode()); }
    Object c36(int n) { return Math.abs(super.hashCode()); }
    Object c37(Random r) { return (int) (r.nextDouble() * 10); }
    Object c38(Random r, int n) { return (int) (r.nextDouble() * n); }
    Object c39(Random r, int n) { return (int) (n * r.nextDouble()); }
    Object c40(Random r, int n) { return (long) (r.nextDouble() * n); }
    Object c41(Random r, int n) { return (int) (Math.random() * n); }
    Object c42(Random r, int n) { return (int) (r.nextFloat() * n); }
    Object c43(Random r, int n) { return (int) (r.nextDouble() * n + 1); }
    Object c44(Random r) { return (int) r.nextDouble(); }
    Object c45(Random r) { return (int) Math.random(); }
    Object c46(Random r) { return (long) Math.random(); }
    Object c47(Random r) { return (int) r.nextFloat(); }
    Object c48(Random r) { return (short) r.nextDouble(); }
    Object c49(Random r) { return (int) Math.round(r.nextDouble()); }
    Object c50(Random r) { double d = r.nextDouble(); return (int) d; }
    Object c51(Random r, int n) { double d = r.nextDouble() * n; return (int) d; }
    Object c52(Random r) { return (int) (r.nextDouble()); }
    Object c53(Random r) { return (int) (Math.random() + 0); }
}
