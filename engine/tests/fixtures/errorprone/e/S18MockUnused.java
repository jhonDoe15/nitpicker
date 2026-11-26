import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.google.inject.testing.fieldbinder.Bind;
import org.mockito.Mock;
import org.mockito.Spy;

class S18MockUnused {
  public Object test() {
    S18MockUnused test = mock(S18MockUnused.class);
    when(test.test()).thenCallRealMethod();
    return null;
  }

  class InitializedSeparately {
    private S18MockUnused test;

    public Object test() {
      test = mock(S18MockUnused.class);
      when(test.test()).thenCallRealMethod();
      return null;
    }
  }

  public Object spyNeverUsed() {
    S18MockUnused test = spy(new S18MockUnused());
    verify(test).test();
    return null;
  }

  static class NonStaticVerify {
    public Object test() {
      NonStaticVerify test = spy(new NonStaticVerify());
      verify(test).test();
      return null;
    }

    NonStaticVerify verify(NonStaticVerify t) {
      return t;
    }
  }

  public Object passedToProduction() {
    S18MockUnused test = mock(S18MockUnused.class);
    when(test.test()).thenCallRealMethod();
    return test.test();
  }

  static class PossiblyBound {
    @Bind @Mock public PossiblyBound test;

    public Object test() {
      when(test.test()).thenCallRealMethod();
      return null;
    }
  }

  static class PublicField {
    @Mock public PublicField test;

    public Object test() {
      when(test.test()).thenCallRealMethod();
      return null;
    }
  }

  static class QualifiedWithThis {
    @Mock private QualifiedWithThis test;

    public QualifiedWithThis test() {
      return this.test;
    }
  }

  static class PrivateField {
    @Mock private PrivateField test;

    public Object test() {
      when(test.test()).thenCallRealMethod();
      return null;
    }
  }

  static class Nested {
    @Mock private Nested test;

    public Object test() {
      doAnswer(
              a -> {
                when(test.test()).thenReturn(null);
                return null;
              })
          .when(test)
          .test();
      return null;
    }
  }

  static class SpyAnnotated {
    @Spy private SpyAnnotated test;

    public Object test() {
      when(test.test()).thenCallRealMethod();
      return null;
    }
  }

  private static class PrivateClass {
    @Mock PrivateClass test;

    public Object test() {
      when(test.test()).thenCallRealMethod();
      return null;
    }
  }

  static class SuppressedField {
    @SuppressWarnings("MockNotUsedInProduction")
    @Mock
    private SuppressedField test;

    public Object test() {
      when(test.test()).thenCallRealMethod();
      return null;
    }
  }

  static class SuppressedMethod {
    @SuppressWarnings("MockNotUsedInProduction")
    public Object test() {
      SuppressedMethod local = mock(SuppressedMethod.class);
      when(local.test()).thenCallRealMethod();
      return null;
    }
  }

  static class InMethods {
    public Object assigned() {
      Object local;
      local = mock(Object.class);
      when(local.toString()).thenReturn("");
      return null;
    }

    public Object twoMocks() {
      Object first = mock(Object.class);
      Object second = mock(Object.class);
      when(first.toString()).thenReturn("");
      when(second.toString()).thenReturn(first.toString());
      return second;
    }

    public void parameters(@Mock Object param) {
      when(param.toString()).thenReturn("");
    }

    public Object anonymous() {
      return new Object() {
        Object inner = mock(Object.class);

        void use() {
          when(inner.toString()).thenReturn("");
        }
      };
    }

    public Object localClass() {
      class Local {
        Object inner = mock(Object.class);

        void use() {
          when(inner.toString()).thenReturn("");
        }
      }
      return new Local();
    }

    public void verified() {
      Object v = mock(Object.class);
      verify(v).toString();
      Object w = mock(Object.class);
      w.toString();
    }

    public void shadowed() {
      Object test = mock(Object.class);
      when(test.toString()).thenReturn("");
      Runnable r = () -> {
        Object test2 = test;
      };
    }

    private Object field = mock(Object.class);

    private Object other = mock(Object.class);

    public Object useField() {
      when(field.toString()).thenReturn("");
      return other;
    }
  }
}
