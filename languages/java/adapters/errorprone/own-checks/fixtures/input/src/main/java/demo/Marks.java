package demo;

import cov.DoNotMutate;

public class Marks {
  @DoNotMutate
  int one() {
    return 1;
  }

  @DoNotMutate int two() {
    return 2;
  }
}
