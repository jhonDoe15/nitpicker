package p;

import java.util.Random;
import java.security.SecureRandom;

public class R {
    Random fld;
    boolean a() { return new Random().isDeprecated(); }
    byte[] b() { return new SecureRandom().generateSeed(2); }
    String c() { return new SecureRandom().getAlgorithm(); }
    void d() { new SecureRandom().reseed(); }
    boolean e() { return new Random().equals(null); }
    int f(Random p) { return p.nextInt(); }
    int g() { return fld.nextInt(); }
    int h(boolean z) {
        Random r = z ? new Random() : new Random(1);
        return r.nextInt();
    }
    int i(boolean z, Random q) {
        Random r = z ? new Random() : q;
        return r.nextInt();
    }
    int j(boolean z) {
        Random r;
        if (z) {
            r = new Random();
        } else {
            r = new Random(2);
        }
        return r.nextInt();
    }
    int k(boolean z, Random q) {
        Random r = q;
        if (z) {
            r = new Random();
        }
        return r.nextInt();
    }
    int l() {
        Random r = new Random();
        fld = r;
        return r.nextInt();
    }
    int m() {
        fld = new Random();
        return fld.nextInt();
    }
    int n() {
        Random r = new Random();
        try {
            return r.nextInt();
        } finally {
            System.out.println();
        }
    }
    int o() {
        Random r = new Random();
        try {
            System.out.println();
        } catch (RuntimeException ex) {
            return 0;
        }
        return r.nextInt();
    }
    int p() {
        Random r = null;
        for (int i = 0; i < 2; i++) {
            r = new Random();
        }
        return r.nextInt();
    }
    int q() {
        Random r = new Random();
        while (true) {
            int v = r.nextInt();
            if (v > 0) return v;
            r = new Random();
        }
    }
    int s() {
        var list = java.util.List.of(new Random());
        return list.get(0).nextInt();
    }
    int t() { return ((Random) new SecureRandom()).nextInt(); }
    int u() { return new Random() { }.nextInt(); }
    long v() { return new Random().nextLong(5L); }
    int w() {
        synchronized (this) {
            return new Random().nextInt();
        }
    }
    static int x() { Random r = new Random(); return r.nextInt(); }
    R() { int z = new Random().nextInt(); }
    static { int z = new Random().nextInt(); }
    int y = new Random().nextInt();
}
