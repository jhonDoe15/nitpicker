package com.google.errorprone;

public class CompilationTestHelper {
  public static CompilationTestHelper newInstance() {
    return new CompilationTestHelper();
  }

  public CompilationTestHelper addSourceLines(String path, String... lines) {
    return this;
  }

  public CompilationTestHelper addSourceFile(String path) {
    return this;
  }

  public CompilationTestHelper expectNoDiagnostics() {
    return this;
  }

  public void doTest() {}
}
