package e;

import com.google.errorprone.annotations.CanIgnoreReturnValue;
import com.google.errorprone.annotations.CheckReturnValue;

class F27Conditional {
    @CheckReturnValue
    static int pick(byte value) {
        return value;
    }

    @CheckReturnValue
    static int pick(short value) {
        return value;
    }

    @CanIgnoreReturnValue
    static int pick(int value) {
        return value;
    }

    void run(boolean flag, byte b, short s, char c, Byte boxed) {
        pick(flag ? b : 1);
        pick(flag ? 1 : b);
        pick(flag ? b : 300);
        pick(flag ? s : 1);
        pick(flag ? b : s);
        pick(flag ? boxed : 1);
        pick(flag ? c : 1);
        pick(flag ? b : (short) 1);
    }

    void nested(boolean flag, byte b) {
        pick(flag ? b : (true ? 1 : 2));
        pick(flag ? b : (1 > 0 ? 3 : 400));
    }
}
