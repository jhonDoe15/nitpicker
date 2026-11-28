package org.mockito.stubbing;

public interface Answer<T> {
    T answer(Object invocation) throws Throwable;
}
