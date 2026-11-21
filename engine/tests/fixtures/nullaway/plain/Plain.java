package plain;

import marks.Nullable;

public class Plain {
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
    }
}
