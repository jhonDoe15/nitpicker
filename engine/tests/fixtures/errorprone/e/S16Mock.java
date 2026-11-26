import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.mockito.BDDMockito;
import org.mockito.Mock;
import org.mockito.stubbing.OngoingStubbing;

class S16Mock {
    @Mock public S16Mock field;
    @Mock(answer = "deep") public S16Mock deep;
    S16Mock other;

    public Object test() {
        return null;
    }

    final Object fin() {
        return null;
    }

    void direct() {
        S16Mock test = mock(S16Mock.class);
        test.test();
    }

    void assigned() {
        S16Mock test;
        test = mock(S16Mock.class);
        test.test();
        other = mock(S16Mock.class);
        other.test();
        this.other.test();
        int x = 1 + (this.other.test() == null ? 1 : 2);
        Object o = test.test();
        Object c = (Object) test.test();
    }

    void annotated() {
        field.test();
        this.field.test();
        deep.test();
    }

    void withinWhen() {
        S16Mock test = mock(S16Mock.class);
        when(test.test()).thenReturn(null);
        given(test.test()).willReturn(null);
        when((Object) test.test()).thenReturn(null);
        given((Object) test.test()).willReturn(null);
    }

    void realMethods() {
        S16Mock test = mock(S16Mock.class);
        when(test.test()).thenCallRealMethod();
        test.test();
        S16Mock second = mock(S16Mock.class);
        given(second.fin()).willCallRealMethod();
        second.fin();
        S16Mock third = mock(S16Mock.class);
        doCallRealMethod().when(third).test();
        third.test();
        S16Mock fourth = mock(S16Mock.class);
        BDDMockito.willCallRealMethod().given(fourth).test();
        fourth.test();
    }

    <T> OngoingStubbing<T> when(T t) {
        return org.mockito.Mockito.when(t);
    }

    void customWhen() {
        S16Mock test = mock(S16Mock.class);
        when(test.test()).thenReturn(null);
    }

    void finals() {
        S16Mock test = mock(S16Mock.class);
        test.fin();
        test.getClass();
    }

    void options() {
        S16Mock test = mock(S16Mock.class, "name");
        test.test();
        S16Mock reified = mock();
        reified.test();
    }

    void verified() {
        S16Mock test = mock(S16Mock.class);
        verify(test).test();
    }

    void notMock(S16Mock param) {
        param.test();
        new S16Mock().test();
    }

    @SuppressWarnings("DirectInvocationOnMock")
    void suppressed() {
        S16Mock test = mock(S16Mock.class);
        test.test();
    }

    void lambda() {
        S16Mock test = mock(S16Mock.class);
        Runnable r = () -> test.test();
        Runnable s = () -> {
            test.test();
        };
    }
}
