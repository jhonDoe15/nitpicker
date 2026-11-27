package p;

import java.util.Random;
import java.security.SecureRandom;

public class R {
    Random fld;
    Object obj;
    int a() {
        int v = fld.nextInt();
        obj = new Random();
        return v;
    }
    int b() {
        obj = new Random();
        return fld.nextInt();
    }
    int c() {
        int v = fld.nextInt();
        Random r = new Random();
        return v + r.nextInt();
    }
    Object d() { return new SecureRandom().getProvider(); }
    Object e() { return new SecureRandom().getParameters(); }
    Object f() { return new Random().getClass(); }
    double g() { return new Random().nextGaussian(1.0, 2.0); }
    int h() {
        obj = new SecureRandom();
        return fld.nextInt();
    }
    int i(SecureRandom s) {
        obj = new Random();
        return s.nextInt();
    }
    int j() {
        obj = new Object();
        return fld.nextInt();
    }
    int k() {
        obj = new java.util.ArrayList<>();
        return fld.nextInt();
    }
    void l() throws Exception { new Random().wait(); }
    int m() {
        obj = new Random[2];
        return fld.nextInt();
    }
    int n(boolean z) {
        if (z) {
            return fld.nextInt();
        }
        obj = new Random();
        return 0;
    }
    int o(boolean z) {
        while (z) {
            int v = fld.nextInt();
            if (v > 3) return v;
            obj = new Random();
        }
        return 0;
    }
    int q() {
        Random x = new Random();
        x.ints();
        return fld.nextInt();
    }
}
