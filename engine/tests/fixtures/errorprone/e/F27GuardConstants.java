package e;

import com.google.errorprone.annotations.concurrent.GuardedBy;

class F27GuardConstants {
    static final boolean ON = true;
    static final String CHOSEN = ON ? "lock" : "other";
    static final int TWO = -(-2);
    static final double HALF = 0.5;

    final Object lock = new Object();
    final Object lock2 = new Object();

    @GuardedBy(CHOSEN)
    int chosen;

    @GuardedBy(ON ? "lock" : "other")
    int ternary;

    @GuardedBy((String) "lock")
    int cast;

    @GuardedBy("lock" + (1 > 0 ? "" : "!"))
    int compared;

    @GuardedBy("lock" + (char) ('0' + 2))
    int character;

    @GuardedBy("lock" + (int) 2.7)
    int truncated;

    @GuardedBy("lock" + ~-3)
    int complement;

    @GuardedBy("lock" + TWO)
    int named;

    @GuardedBy("lock" + (HALF * 4 > 1 ? "2" : ""))
    int real;

    @GuardedBy("lock" + (TWO << 1 >> 1))
    int shifted;

    void run() {
        chosen++;
        ternary++;
        cast++;
        compared++;
        character++;
        truncated++;
        complement++;
        named++;
        real++;
        shifted++;
    }

    static final byte SMALL = 1;
    static final short MIDDLE = 1;
    static final char LETTER = 'a';

    final Object lock1 = new Object();
    final Object lock97 = new Object();
    final Object locktrue = new Object();

    @GuardedBy("lock" + (true ? SMALL : 'a'))
    int byteChar;

    @GuardedBy("lock" + (true ? 'a' : SMALL))
    int charByte;

    @GuardedBy("lock" + (true ? MIDDLE : LETTER))
    int shortChar;

    @GuardedBy("lock" + (0.0 == -0.0))
    int zeros;

    @GuardedBy("lock" + (0.0 / 0 != 0.0 / 0))
    int notNumber;

    @SuppressWarnings("ReferenceEquality")
    @GuardedBy("lock" + ("a" == "a"))
    int strings;

    void more() {
        byteChar++;
        charByte++;
        shortChar++;
        zeros++;
        notNumber++;
        strings++;
    }
}
