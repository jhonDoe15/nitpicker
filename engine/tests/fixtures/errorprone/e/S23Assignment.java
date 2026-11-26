package e;

import com.google.inject.Inject;
import com.google.testing.junit.testparameterinjector.TestParameter;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;
import org.mockito.junit.MockitoJUnitRunner;

class S23Assignment {
  static class Service {}

  static class NeedsInit {
    @Mock Service service = Mockito.mock(Service.class);
    @Mock Service other = new Service();
    @Mock Service plain;
    @Mock final Service finalMock = null;
    @Mock Service twoA = null, twoB = null;
  }

  static class WithInit {
    @Mock Service service = Mockito.mock(Service.class);

    void setUp() {
      MockitoAnnotations.initMocks(this);
    }
  }

  @RunWith(MockitoJUnitRunner.class)
  static class WithRunner {
    @Mock Service service = Mockito.mock(Service.class);

    class Inner {
      @Mock Service innerMock = Mockito.mock(Service.class);
    }
  }

  static class WithNestedRunner {
    @Mock Service service = Mockito.mock(Service.class);

    @RunWith(MockitoJUnitRunner.class)
    static class Nested {}
  }

  static class Injected {
    @Inject Service service = new Service();
    @Inject final Service finalService = new Service();
    @javax.inject.Inject Service javaxService = new Service();
    @javax.inject.Inject Service javaxPlain;
    @Inject(optional = true) Service optional = new Service();
    @Inject(optional = false) Service notOptional = new Service();
    @TestParameter boolean flag = true;
    @TestParameter boolean flagPlain;
    @Inject @TestParameter Service both = null;
    Service unannotated = new Service();
  }

  static class Both {
    @Mock @Inject Service twice;
    @Mock @Inject Service twiceInit = new Service();
    @Mock @javax.inject.Inject Service twiceJavax;
  }

  void parameters(@Mock @TestParameter Service param, @TestParameter boolean flag, @Mock Service mock) {
    param = null;
    flag = false;
    mock = new Service();
  }

  void assignments(Injected injected, NeedsInit needs, Both both) {
    injected.service = new Service();
    injected.optional = new Service();
    injected.notOptional = new Service();
    injected.flag = false;
    injected.flagPlain = true;
    injected.unannotated = new Service();
    needs.service = null;
    needs.plain = null;
    both.twice = null;
    Object o = injected.service = null;
    foo(injected.service = new Service());
    this.field = null;
    field = null;
    field2 = null;
    optionalField = null;
    tested = false;
  }

  @Mock Service field;
  @Inject Service field2;
  @Inject(optional = true) Service optionalField;
  @TestParameter boolean tested;

  void foo(Service s) {}

  @SuppressWarnings("UnnecessaryAssignment")
  static class Suppressed {
    @Mock Service service = new Service();
    @Inject Service injected = new Service();
  }

  static class SuppressedMember {
    @SuppressWarnings("UnnecessaryAssignment")
    @Mock
    Service service = new Service();

    @SuppressWarnings("UnnecessaryAssignment")
    void assign(Injected injected) {
      injected.service = null;
    }
  }
}
