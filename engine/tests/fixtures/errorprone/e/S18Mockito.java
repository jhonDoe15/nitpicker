import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.Spy;

abstract class S18Mockito {
  static class SpecificException extends Exception {}

  abstract Object foo();

  abstract Object bar() throws SpecificException;

  abstract Object baz() throws Exception;

  abstract void qux();

  interface GenericException<E extends Exception> {
    Object execute() throws E;
  }

  void illegalThrows(S18Mockito t, Exception e, GenericException<Exception> ge, Throwable th) throws Exception {
    when(t.foo()).thenThrow(new Exception());
    when(t.foo()).thenThrow(new IllegalStateException(), new Exception());
    when(t.bar()).thenThrow(new Exception());
    when(t.bar()).thenThrow(e);
    when(t.baz()).thenThrow(new Exception());
    when(t.baz()).thenThrow();
    when(ge.execute()).thenThrow(new Exception());
    when(t.foo()).thenThrow(new RuntimeException());
    when(t.foo()).thenThrow(new Error());
    when(t.foo()).thenThrow(new java.io.IOException());
    when(t.bar()).thenThrow(new SpecificException()).thenThrow(new java.io.IOException());
    when(t.foo()).thenReturn(1).thenThrow(new java.io.IOException());
    when(t.bar()).thenThrow(th);
    when(t.baz()).thenThrow(new Throwable());
    Mockito.when(t.foo()).thenThrow(new Exception());
  }

  @SuppressWarnings("MockIllegalThrows")
  void suppressedThrows(S18Mockito t) {
    when(t.foo()).thenThrow(new Exception());
  }

  @Mock S18Mockito annotatedMock;
  @Spy S18Mockito annotatedSpy;
  S18Mockito spyField = spy(this);
  S18Mockito throwingField = mock(S18Mockito.class);

  void doSetup(S18Mockito mock, S18Mockito other, S18Mockito localSpy) throws Exception {
    doReturn(1).when(mock).foo();
    doAnswer(i -> 1).when(mock).foo();
    doReturn(1, 2).when(mock).foo();
    Mockito.doReturn(1).when(mock).foo();
    doReturn(1).when(mock.foo());
    doThrow(new Exception()).when(other).foo();
    doReturn(2).when(other).foo();
    doReturn(1).when(annotatedSpy).foo();
    doReturn(1).when(annotatedMock).foo();
    doReturn(1).when(spyField).foo();
    doReturn(1).when(this.spyField).foo();
    doReturn(1).when(throwingField).foo();
    doReturn(1).when(foo()).toString();
    S18Mockito localSpyCopy = spy(mock);
    doReturn(1).when(localSpyCopy).foo();
    S18Mockito assigned;
    assigned = spy(mock);
    doReturn(1).when(assigned).foo();
    doReturn(null).when(mock).qux();
    when(mock.foo()).thenReturn(1);
    doReturn(1).when(mock).foo().toString();
  }

  void doThrowSetup(S18Mockito mock, S18Mockito mock2) throws Exception {
    doThrow(new RuntimeException()).when(mock).foo();
    doReturn(1).when(mock).foo();
    when(mock2.foo()).thenThrow(new RuntimeException());
    doReturn(1).when(mock2).foo();
  }

  @SuppressWarnings("MockitoDoSetup")
  void doSuppressed(S18Mockito mock) {
    doReturn(1).when(mock).foo();
  }
}
