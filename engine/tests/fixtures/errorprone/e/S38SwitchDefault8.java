class S38SwitchDefault8 {
  public static void nothing1() {}

  public static void nothing2() {}

  public static void nothing3() {}

  public static void switchDefaultCrash(int i) {
    switch (i) {
      default -> nothing3();
      case 0 -> nothing1();
      case 1 -> nothing2();
    }
  }
}
