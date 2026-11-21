package n.off;

import marks.Nullable;

public class Off {
    public void take(@Nullable Object value) {}

    public void keep(Object value) {}

    public @Nullable Object find() {
        return null;
    }

    @marks.NullMarked
    public static class Strict {
        public void take(@Nullable Object value) {}
    
        public void keep(Object value) {}
    
        public @Nullable Object find() {
            return null;
        }

        int size(@Nullable Object value) {
            return value.hashCode();
        }
    }

    int size(@Nullable Object value) {
        return value.hashCode();
    }
}
