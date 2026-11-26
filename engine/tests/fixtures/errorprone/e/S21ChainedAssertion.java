import static com.google.common.truth.Truth.assertAbout;
import static com.google.common.truth.Truth.assertWithMessage;
import static com.google.common.truth.Truth.assert_;

import com.google.common.truth.FailureMetadata;
import com.google.common.truth.Subject;
import com.google.common.truth.Truth;

class S21ChainedAssertion {
  static final class FooSubject extends Subject {
    private final Foo actual;

    static Factory<FooSubject, Foo> foos() {
      return FooSubject::new;
    }

    static FooSubject assertThat(Foo foo) {
      return assertAbout(foos()).that(foo);
    }

    private FooSubject(FailureMetadata metadata, Foo actual) {
      super(metadata, actual);
      this.actual = actual;
    }

    void hasString(String expected) {
      Truth.assertThat(actual.string()).isEqualTo(expected);
    }

    void hasOtherFooInteger(int expected) {
      Truth.assertThat(actual.otherFoo().integer()).isEqualTo(expected);
    }

    void viaThis(String expected) {
      Truth.assertThat(this.actual.string()).isEqualTo(expected);
    }

    void viaActualMethod(String expected) {
      Truth.assertThat(actual().toString()).isEqualTo(expected);
    }

    FooSubject otherFooAbout() {
      return assertAbout(foos()).that(actual.otherFoo());
    }

    FooSubject otherFooThat() {
      return assertThat(actual.otherFoo());
    }

    void withMessage(String expected) {
      assertWithMessage("blah").that(actual.string()).isEqualTo(expected);
    }

    void withMessageWithArgs(String expected) {
      assertWithMessage("%s", "blah").that(actual.string()).isEqualTo(expected);
    }

    void plainAssert(String expected) {
      assert_().that(actual.string()).isEqualTo(expected);
    }

    void withArgs(String expected) {
      Truth.assertThat(actual.args("x")).isEqualTo(expected);
    }

    void notChained(String expected) {
      Truth.assertThat(expected).isEqualTo(actual.string());
      Truth.assertThat(string()).isEqualTo(expected);
    }

    static void staticMethod(Foo foo) {
      Truth.assertThat(foo.string()).isEqualTo("");
    }

    String string() {
      return actual.string();
    }

    @SuppressWarnings("ChainedAssertionLosesContext")
    void suppressed(String expected) {
      Truth.assertThat(actual.string()).isEqualTo(expected);
    }
  }

  static final class Foo {
    final String string;
    final int integer;

    Foo(String string, int integer) {
      this.string = string;
      this.integer = integer;
    }

    String string() {
      return string;
    }

    String args(String value) {
      return value;
    }

    int integer() {
      return integer;
    }

    Foo otherFoo() {
      return this;
    }
  }

  static final class BarSubject extends Subject {
    private BarSubject(FailureMetadata metadata, Foo actual) {
      super(metadata, actual);
    }

    static Factory<BarSubject, Foo> bars() {
      return BarSubject::new;
    }

    static Factory<BarSubject, Foo> otherBars() {
      return BarSubject::new;
    }

    static BarSubject assertThat(Foo foo) {
      return assertAbout(bars()).that(foo);
    }

    void ambiguous(Foo actual) {
      assertThat(actual.otherFoo());
    }
  }

  void someTestMethod() {
    Truth.assertThat("").isTrue();
  }
}
