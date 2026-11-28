package com.google.common.base;

public final class Verify {
    private Verify() {
    }

    public static <T> T verifyNotNull(T reference) {
        return reference;
    }
}
