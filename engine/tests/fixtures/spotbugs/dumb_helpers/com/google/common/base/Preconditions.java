package com.google.common.base;

public final class Preconditions {
    public static int calls;

    private Preconditions() {
    }

    public static <T> T checkNotNull(T reference) {
        calls++;
        return reference;
    }

    public static <T> T checkNotNull(T reference, Object message) {
        calls++;
        return reference;
    }

    public static <T> T checkNotNull(T reference, String template, Object argument) {
        calls++;
        return reference;
    }

    public static <T> T checkNotNull(T reference, String template, Object... arguments) {
        calls++;
        return reference;
    }

    public static void checkArgument(boolean test, Object message) {
    }

    public static void checkState(boolean test, Object message) {
    }

    public static int checkElementIndex(int index, int size, String description) {
        return index;
    }
}
