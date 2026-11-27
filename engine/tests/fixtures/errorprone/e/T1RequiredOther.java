package e;

class T1RequiredOther {
  @T1PublicAndFinalRequired static int other = 0;

  @T1Private
  @T1AbstractRequired
  void two() {}
}
