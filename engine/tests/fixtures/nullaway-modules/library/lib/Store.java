package lib;

public final class Store {
    private Store() {}

    @Nullable
    public static String find(String key) {
        return key.isEmpty() ? null : key;
    }

    public static String require(String key) {
        return key;
    }
}
