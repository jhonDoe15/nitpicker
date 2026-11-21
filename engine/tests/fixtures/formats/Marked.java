package extra;

@interface DoNotMutate {}

@interface CoverageIgnore {}

class Marked {
  @DoNotMutate
  int one() {
    return 1;
  }

  @CoverageIgnore int two() {
    return 2;
  }

  @Deprecated
  int three() {
    return 3;
  }
}
