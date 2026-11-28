package p;

import java.util.Random;
import java.security.SecureRandom;

public class R {
    Random field = new Random();
    static Random sf;
    int a() { return new Random().nextInt(); }
    int b() {
        return new Random().nextInt(10);
    }
    int c(long seed) { return new Random(seed).nextInt(); }
    double d() { return new Random().nextDouble(); }
    int e() {
        Random r = new Random();
        return r.nextInt();
    }
    int f() {
        Random r = new Random();
        return r.nextInt() + r.nextInt();
    }
    int g() { return new SecureRandom().nextInt(); }
    void h() { new Random().nextBytes(new byte[3]); }
    long i() { return new Random().longs().count(); }
    Random j() { return new Random(); }
    String k() { return new Random().toString(); }
    int l() { return new Random(42L).ints(1).sum(); }
    int m() {
        return new Random()
            .nextInt();
    }
    void n() { sf = new Random(); }
    int o() { return (new Random()).nextInt() + (new Random()).nextInt(); }
    boolean p() { return new Random().nextBoolean(); }
    int q() { return new java.util.concurrent.ThreadLocalRandom[0].length; }
    int s() { return new MyRandom().nextInt(); }
    static class MyRandom extends Random { }
    int t() { Random r; int v = (r = new Random()).nextInt(); return v + r.hashCode(); }
    Runnable u() { return () -> new Random().nextInt(); }
    int v(int x) { return x > 0 ? new Random().nextInt() : 0; }
    int w() { return new Random().hashCode(); }
    void x() { new Random().setSeed(1); }
    int y() { return new Random().nextGaussian() > 0 ? 1 : 0; }
}
