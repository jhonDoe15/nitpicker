package org.mockito;

public class BDDMockito {
    public static <T> BDDMyOngoingStubbing<T> given(T call) {
        return null;
    }

    public static BDDStubber willCallRealMethod() {
        return null;
    }

    public interface BDDMyOngoingStubbing<T> {
        BDDMyOngoingStubbing<T> willReturn(T value);

        BDDMyOngoingStubbing<T> willCallRealMethod();
    }

    public interface BDDStubber {
        <T> T given(T mock);
    }
}
