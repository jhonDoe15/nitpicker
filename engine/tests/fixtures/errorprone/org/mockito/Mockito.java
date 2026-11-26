package org.mockito;

import org.mockito.stubbing.OngoingStubbing;
import org.mockito.stubbing.Stubber;
import org.mockito.verification.VerificationMode;

public class Mockito {
    public static <T> T mock(Class<T> type) {
        return null;
    }

    public static <T> OngoingStubbing<T> when(T call) {
        return null;
    }

    public static <T> T verify(T mock) {
        return mock;
    }

    public static <T> T verify(T mock, VerificationMode mode) {
        return mock;
    }

    public static VerificationMode never() {
        return null;
    }

    public static VerificationMode times(int count) {
        return null;
    }

    public static Stubber doThrow(Throwable... throwables) {
        return null;
    }

    public static void verifyZeroInteractions(Object... mocks) {}

    public static <T> T spy(T object) {
        return object;
    }
}
