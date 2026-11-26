package e;

import javax.inject.Inject;

public class S10InjectMember {
  @Inject private final String stringFieldWithInject;
  @Inject private final Long longFieldWithInject;
  private final String stringFieldWithoutInject;

  @Inject
  public S10InjectMember(
      String stringFieldWithInject, String stringFieldWithoutInject, Long longFieldWithInject) {
    this.stringFieldWithInject = stringFieldWithInject;
    this.stringFieldWithoutInject = stringFieldWithoutInject;
    this.longFieldWithInject = longFieldWithInject;
  }

  public class InjectOnConstructorOnly {
    private final String stringFieldWithoutInject;

    @Inject
    public InjectOnConstructorOnly(String stringFieldWithoutInject) {
      this.stringFieldWithoutInject = stringFieldWithoutInject;
    }
  }

  public class InjectOnFieldOnly {
    @Inject private String stringFieldWithInject;
  }

  public class MixedInject {
    @Inject private String stringFieldWithInject;

    @Inject
    public MixedInject() {}
  }

  public class BareAssignment {
    @Inject String a;
    @javax.inject.Inject String b;
    @com.google.inject.Inject String c;
    String d;

    @Inject
    BareAssignment(String a, String b, String c, String d) {
      this.a = a;
      b = b;
      this.c = c;
      this.d = d;
    }
  }

  public class TwoConstructors {
    @Inject String a;

    @Inject
    TwoConstructors(String a) {
      this.a = a;
    }

    @Inject
    TwoConstructors(int i) {}
  }

  public class OneInjectedOneNot {
    @Inject String a;

    @Inject
    OneInjectedOneNot(String a) {
      this.a = a;
    }

    OneInjectedOneNot(int i) {
      this.a = "";
    }
  }

  public class StaticField {
    @Inject static String a;

    @Inject
    StaticField(String x) {
      a = x;
    }
  }

  public class NotAssigned {
    @Inject String a;

    @Inject
    NotAssigned(String x) {}
  }

  public class OtherObjectAssigned {
    @Inject String a;

    @Inject
    OtherObjectAssigned(OtherObjectAssigned other) {
      other.a = "x";
    }
  }

  public class AnnotationOrder {
    @Deprecated @Inject String a;
    @Inject @Deprecated String b;

    @Inject
    AnnotationOrder(String a, String b) {
      this.a = a;
      this.b = b;
    }
  }

  @SuppressWarnings("InjectOnMemberAndConstructor")
  public class Suppressed {
    @Inject String a;

    @Inject
    Suppressed(String a) {
      this.a = a;
    }
  }

  public class MethodInject {
    @Inject String a;

    @Inject
    void setA(String a) {
      this.a = a;
    }

    @Inject
    MethodInject(String a) {}
  }

  public class LocalClassAssign {
    @Inject String a;

    @Inject
    LocalClassAssign(String x) {
      new Object() {
        void f() {
          a = x;
        }
      };
    }
  }

  public class NoConstructor {
    @Inject String a;
  }
}
