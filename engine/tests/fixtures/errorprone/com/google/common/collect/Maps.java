package com.google.common.collect;

import java.util.IdentityHashMap;

public final class Maps {
    private Maps() {}

    public static <K, V> IdentityHashMap<K, V> newIdentityHashMap() {
        return new IdentityHashMap<>();
    }
}
