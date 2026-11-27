import static com.google.common.truth.Truth.assertWithMessage;

class F43Or5 {
  void test() {
    // BUG: Diagnostic contains:
    assertWithMessage("%s").that("").isNull();
  }
}
