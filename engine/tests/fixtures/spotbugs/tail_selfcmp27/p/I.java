package p;

import java.util.ArrayDeque;

public class I {
    static class Ref implements AutoCloseable {
        int length() { return 3; }
        Ref slice(int a, int b) { return this; }
        public void close() { }
    }
    private final ArrayDeque<Ref> pending = new ArrayDeque<>();

    private void releasePendingBytes(int bytesConsumed) {
        int bytesToRelease = bytesConsumed;
        while (bytesToRelease != 0) {
            try (Ref reference = pending.pollFirst()) {
                assert reference != null;
                if (bytesToRelease < reference.length()) {
                    pending.addFirst(reference.slice(bytesToRelease, reference.length() - bytesToRelease));
                    bytesToRelease -= bytesToRelease;
                } else {
                    bytesToRelease -= reference.length();
                }
            }
        }
    }
    int simple(int a) { a -= a; return a; }
    int inTry(int a) { try (Ref r = new Ref()) { a -= a; } return a; }
    boolean merged(boolean c, int a, int b) {
        int x;
        if (c) x = a; else x = b;
        int y = x;
        return y == x;
    }
    int looped(int n) {
        int x = n;
        while (n > 0) { x++; n--; }
        int y = x;
        return y - x;
    }
    int looped2(int n) {
        int x = n;
        while (n > 0) { x++; n--; }
        return x & x;
    }
}
