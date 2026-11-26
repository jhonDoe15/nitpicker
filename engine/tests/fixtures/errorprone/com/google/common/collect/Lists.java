package com.google.common.collect;

import java.util.ArrayList;
import java.util.LinkedList;

public final class Lists {
    public static <E> ArrayList<E> newArrayList() {
        return new ArrayList<E>();
    }

    public static <E> ArrayList<E> newArrayList(Iterable<? extends E> elements) {
        return new ArrayList<E>();
    }

    public static <E> LinkedList<E> newLinkedList() {
        return new LinkedList<E>();
    }

    public static <E> LinkedList<E> newLinkedList(Iterable<? extends E> elements) {
        return new LinkedList<E>();
    }

    public static <E> ArrayList<E> newArrayList(E... elements) {
        return new ArrayList<E>();
    }
}
