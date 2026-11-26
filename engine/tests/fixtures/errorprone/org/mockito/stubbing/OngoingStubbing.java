package org.mockito.stubbing;

public interface OngoingStubbing<T> {
    OngoingStubbing<T> thenReturn(T value);

    OngoingStubbing<T> thenThrow(Throwable... throwables);
}
