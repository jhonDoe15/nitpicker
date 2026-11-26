package com.google.errorprone;

public class BugCheckerRefactoringTestHelper {
  public static BugCheckerRefactoringTestHelper newInstance() {
    return new BugCheckerRefactoringTestHelper();
  }

  public BugCheckerRefactoringTestHelper addInput(String path) {
    return this;
  }

  public BugCheckerRefactoringTestHelper addInputLines(String path, String... lines) {
    return this;
  }

  public BugCheckerRefactoringTestHelper addInputFile(String path) {
    return this;
  }

  public BugCheckerRefactoringTestHelper addOutput(String path) {
    return this;
  }

  public BugCheckerRefactoringTestHelper addOutputLines(String path, String... lines) {
    return this;
  }

  public BugCheckerRefactoringTestHelper addOutputFile(String path) {
    return this;
  }

  public BugCheckerRefactoringTestHelper expectUnchanged() {
    return this;
  }

  public void doTest() {}
}
