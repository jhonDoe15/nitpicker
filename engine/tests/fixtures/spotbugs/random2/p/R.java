package p;

import java.util.Random;
import java.security.SecureRandom;

public class R {
    long a() { return new Random().nextLong(); }
    float b() { return new Random().nextFloat(); }
    int c() { return new Random().nextInt(1, 5); }
    double d() { return new Random().nextExponential(); }
    long e() { return new Random().doubles().count(); }
    int f() {
        int x = new Random().nextInt();
        int y = new Random().nextInt();
        return x + y;
    }
    int g(boolean z) {
        Random r = new Random();
        if (z) {
            return 1;
        }
        return r.nextInt();
    }
    int h() {
        Random r = new Random();
        int s = 0;
        for (int i = 0; i < 3; i++) {
            s += r.nextInt();
        }
        return s;
    }
    int i() {
        Random r = new Random();
        r.setSeed(3);
        return r.nextInt();
    }
    int j() {
        Random r = new Random();
        System.out.println(r);
        return r.nextInt();
    }
    int k() {
        Random r = new Random();
        int q = 5;
        return r.nextInt(q);
    }
    byte[] l() {
        byte[] out = new byte[4];
        new SecureRandom().nextBytes(out);
        return out;
    }
    int m() throws Exception { return SecureRandom.getInstanceStrong().nextInt(); }
    int n() { return new SecureRandom(new byte[1]).nextInt(); }
    int o() {
        Random r = new Random(), s = new Random();
        return r.nextInt() + s.nextInt();
    }
    int p() {
        Random r = new Random();
        Random t = r;
        return t.nextInt();
    }
    int q() {
        Object o = new Random();
        return ((Random) o).nextInt();
    }
    int s() {
        java.util.random.RandomGenerator g = new Random();
        return g.nextInt();
    }
    int t() { return new Random().ints(1, 0, 3).sum(); }
    int u() {
        Random r = new Random();
        int a = r.nextInt();
        r = new Random();
        return a + r.nextInt();
    }
    void v() { new Random().nextInt(); }
    int w() { return new Random(System.nanoTime()).nextInt(); }
    int x() { return new Random(new Random().nextLong()).nextInt(); }
}
