package lib.loose;

import lib.Nullable;

public final class Lookup {
    private Lookup() {}

    @Nullable
    public static String find(String key) {
        return key.isEmpty() ? null : key;
    }
}
