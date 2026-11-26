package e;

import com.google.errorprone.annotations.DoNotMock;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.Spy;

class S9DoNotMockObjects {
  class MockableObject {}

  @DoNotMock("the reason why OtherDoNotMockObject is DoNotMock")
  class DoNotMockObject {
    DoNotMockObject(String s) {}

    DoNotMockObject() {}
  }

  @DoNotMock("")
  class OtherDoNotMockObject {}

  @DoNotMock
  class DefaultDoNotMockObject {}

  @Inherited
  @DoNotMock("the reason why MetaDoNotMock is DoNotMock")
  @Retention(RetentionPolicy.RUNTIME)
  @interface MetaDoNotMock {}

  @MetaDoNotMock
  static class MetaDoNotMockObject {}

  @MetaDoNotMock
  @Retention(RetentionPolicy.RUNTIME)
  @interface DoubleMetaDoNotMock {}

  @DoubleMetaDoNotMock
  static class DoubleMetaAnnotatedDoNotMock {}

  class ExtendsDoNotMockObject extends DoNotMockObject {}

  class ExtendsMetaDoNotMockObject extends MetaDoNotMockObject {}

  @DoNotMock("the reason why DoNotMockInterface is DoNotMock")
  interface DoNotMockInterface {}

  @MetaDoNotMock
  interface MetaDoNotMockInterface {}

  class ImplementsDoNotMockInterfaceObject implements DoNotMockInterface {}

  class ImplementsMetaDoNotMockInterfaceObject implements MetaDoNotMockInterface {}

  @DoNotMock("generic")
  static class GenericDoNotMock<T> {}
}

class S9DoNotMockUse {
  void f() {
    Mockito.spy(S9DoNotMockObjects.MockableObject.class);
    Mockito.mock(S9DoNotMockObjects.DoNotMockObject.class);
    Mockito.spy(S9DoNotMockObjects.OtherDoNotMockObject.class);
    Mockito.mock(S9DoNotMockObjects.DefaultDoNotMockObject.class);
    Mockito.mock(S9DoNotMockObjects.MetaDoNotMockObject.class);
    Mockito.mock(S9DoNotMockObjects.DoubleMetaAnnotatedDoNotMock.class);
    Mockito.mock(S9DoNotMockObjects.ExtendsDoNotMockObject.class);
    Mockito.mock(S9DoNotMockObjects.GenericDoNotMock.class);
    S9DoNotMockObjects.DoNotMockObject made = Mockito.spy(new S9DoNotMockObjects().new DoNotMockObject());
    Object o = Mockito.mock(Object.class);
    Mockito.mock((Class) S9DoNotMockObjects.DoNotMockObject.class);
    Class<? extends S9DoNotMockObjects.DoNotMockObject> wild = S9DoNotMockObjects.ExtendsDoNotMockObject.class;
    Mockito.mock(wild);
  }

  @SuppressWarnings("DoNotMock")
  void suppressed() {
    Mockito.mock(S9DoNotMockObjects.DoNotMockObject.class);
  }

  @Mock S9DoNotMockObjects.MockableObject mockableObject;
  @Mock S9DoNotMockObjects.DoNotMockObject unmockableObject;
  @Mock S9DoNotMockObjects.DoNotMockInterface doNotMockInterface;
  @Spy S9DoNotMockObjects.MockableObject unspyableObject;
  @Spy S9DoNotMockObjects.DoNotMockObject spyableObject;
  @Mock S9DoNotMockObjects.ExtendsDoNotMockObject extendsDoNotMockObject;
  @Mock S9DoNotMockObjects.ExtendsMetaDoNotMockObject extendsMetaDoNotMockObject;
  @Mock S9DoNotMockObjects.ImplementsDoNotMockInterfaceObject implementsDoNotMockInterfaceObject;
  @Mock S9DoNotMockObjects.ImplementsMetaDoNotMockInterfaceObject implementsMetaDoNotMockInterfaceObject;
  @Mock S9DoNotMockObjects.MetaDoNotMockObject metaAnnotatedDoNotMockObject;
  @Mock S9DoNotMockObjects.MetaDoNotMockInterface metaDoNotMockInterface;
  @Mock S9DoNotMockObjects.DoubleMetaAnnotatedDoNotMock doubleMetaAnnotatedDoNotMock;
  @Mock S9DoNotMockObjects.GenericDoNotMock<String> genericDoNotMock;
  @Mock S9DoNotMockObjects.DefaultDoNotMockObject defaultDoNotMock;
  @Mock S9DoNotMockObjects.DoNotMockObject[] arrayOfDoNotMock;
  @SuppressWarnings("DoNotMock")
  @Mock S9DoNotMockObjects.DoNotMockObject quiet;

  void local() {
    @Mock S9DoNotMockObjects.DoNotMockObject localMock = null;
  }
}

class S9DoNotMockGeneric<E> {
  @Mock E e;

  <T> T f(T x) {
    T m = Mockito.spy(x);
    return m;
  }
}
