package plain;

import marks.Nullable;

@marks.NullMarked
public class Apart {
    public void take(@Nullable Object value) {}

    public void keep(Object value) {}

    public @Nullable Object find() {
        return null;
    }

    @marks.NullUnmarked
    public static class Loose {
        public void take(@Nullable Object value) {}
    
        public void keep(Object value) {}
    
        public @Nullable Object find() {
            return null;
        }
    }
}
