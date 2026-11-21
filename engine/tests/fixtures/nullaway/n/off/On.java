package n.off;

import marks.Nullable;

@marks.NullMarked
public class On {
    public void take(@Nullable Object value) {}

    public void keep(Object value) {}

    public @Nullable Object find() {
        return null;
    }

    int size(@Nullable Object value) {
        return value.hashCode();
    }
}
