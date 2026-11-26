package e;

import com.google.common.testing.EqualsTester;
import com.google.errorprone.BugCheckerRefactoringTestHelper;
import com.google.errorprone.CompilationTestHelper;
import java.util.function.Supplier;
import org.junit.Test;

class S14TestCall {
  CompilationTestHelper field;
  static CompilationTestHelper staticField;

  @Test
  void test() {
    new EqualsTester().addEqualityGroup(this, this);
    hashCode();
  }

  @Test
  void test2(CompilationTestHelper helper) {
    helper.addSourceFile("testdata/Foo.java");
  }

  @Test
  void test3(BugCheckerRefactoringTestHelper helper) {
    helper.addInput("testdata/Foo.java");
  }

  @Test
  void localVariable() {
    CompilationTestHelper helper = CompilationTestHelper.newInstance();
    helper.addSourceLines("A.java", "class A {}");
  }

  @Test
  void chain() {
    CompilationTestHelper.newInstance().addSourceFile("a").addSourceLines("b", "c");
  }

  @Test
  void fieldReceiver() {
    field.addSourceFile("testdata/Foo.java");
  }

  @Test
  void thisFieldReceiver() {
    this.field.addSourceFile("testdata/Foo.java");
  }

  @Test
  void staticFieldReceiver() {
    S14TestCall.staticField.addSourceFile("testdata/Foo.java");
  }

  @Test
  void fieldChain() {
    field.addSourceFile("a").addSourceFile("b");
  }

  @Test
  void expectNoDiagnostics(CompilationTestHelper helper) {
    helper.expectNoDiagnostics();
  }

  @Test
  void terminated() {
    new EqualsTester().addEqualityGroup(this, this).testEquals();
  }

  @Test
  void terminatedSeparately(CompilationTestHelper helper) {
    helper.addSourceFile("a");
    helper.doTest();
  }

  @Test
  void terminatedElsewhere(CompilationTestHelper helper, CompilationTestHelper other) {
    helper.addSourceFile("a");
    other.doTest();
  }

  @Test
  void wrongPairing(CompilationTestHelper helper, BugCheckerRefactoringTestHelper refactoring) {
    helper.addSourceFile("a");
    refactoring.doTest();
  }

  @Test
  void returned(CompilationTestHelper helper) {
    helper.addSourceFile("a");
  }

  CompilationTestHelper returnsHelper(CompilationTestHelper helper) {
    return helper.addSourceFile("a");
  }

  @Test
  Object insideReturn(CompilationTestHelper helper) {
    return new Object() {
      void run() {
        helper.addSourceFile("a");
      }
    };
  }

  @Test
  void lambda(CompilationTestHelper helper) {
    Runnable r = () -> helper.addSourceFile("a");
  }

  @Test
  void memberReference(CompilationTestHelper helper) {
    Supplier<CompilationTestHelper> s = () -> helper;
    Runnable r = helper::doTest;
    helper.addSourceFile("a");
  }

  @Test
  void memberReferenceSetUp(CompilationTestHelper helper) {
    var reference = (java.util.function.Function<String, CompilationTestHelper>) helper::addSourceFile;
  }

  @Test
  void memberReferenceRun() {
    var equalsTester = new EqualsTester().addEqualityGroup(this, this);
    Runnable r = equalsTester::testEquals;
  }

  @SuppressWarnings("MissingTestCall")
  @Test
  void suppressed(CompilationTestHelper helper) {
    helper.addSourceFile("a");
  }

  void notATest(CompilationTestHelper helper) {
    helper.addSourceFile("a");
  }

  public void testJunit3Style(CompilationTestHelper helper) {
    helper.addSourceFile("a");
  }

  public void testJunit3NoArgs() {
    CompilationTestHelper.newInstance().addSourceFile("a");
  }

  @org.junit.experimental.theories.Theory
  public void theory() {
    CompilationTestHelper.newInstance().addSourceFile("a");
  }
}
