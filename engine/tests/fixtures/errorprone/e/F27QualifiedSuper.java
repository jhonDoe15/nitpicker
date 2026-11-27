package e;

import com.google.errorprone.annotations.CanIgnoreReturnValue;
import com.google.errorprone.annotations.CheckReturnValue;

class F27QualifiedSuper {
    static class Base {
        @CheckReturnValue
        int value() {
            return 1;
        }
    }

    interface Shape {
        @CheckReturnValue
        default int area() {
            return 1;
        }
    }

    static class Outer extends Base implements Shape {
        @Override
        @CanIgnoreReturnValue
        int value() {
            return 2;
        }

        @Override
        @CanIgnoreReturnValue
        public int area() {
            Shape.super.area();
            return 2;
        }

        class Inner {
            void run() {
                Outer.super.value();
                Outer.this.value();
            }
        }
    }
}
