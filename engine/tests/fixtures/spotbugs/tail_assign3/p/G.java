package p;

public class G {
    int f, g; volatile int vc;
    void b1() {
        int x = f;
        f = x;
    }
    void b2() { int x = f; f = x; g = x; }
    void b3() {
        int x;
        x = this.f;
        this.f = x;
    }
    void b4() {
        int newCount = this.vc - 1;
        newCount = this.vc;
        this.vc = newCount;
    }
    void b5(boolean c) {
        int newCount = this.vc + 1;
        if (c) {
            newCount = this.vc;
            this.vc = newCount;
            return;
        }
        this.vc = newCount;
    }
    static class S {
        volatile int count; int mod;
        Object put(Object v, boolean c) {
            int newCount = this.count + 1;
            if (c) {
                ++mod;
                newCount = this.count;
                this.count = newCount;
                return null;
            }
            this.count = newCount;
            return v;
        }
    }
    void b6() { int x = f; x = f; f = x; }
    void b7() { int x = 0; x = f; f = x; }
}
