package e;

import dagger.MembersInjector;

class S15Unicode {
  // comment with café
  /** doc with über */
  String literal = "naïve";
  char letter = 'é';
  String text = """
      café
      """;
  int café = 1;
  int naïveé = café;
  String joined = "a" + "é" + café;
  int ok = 1; // é
  int next = 2;

  @SuppressWarnings("UnicodeInCode")
  int suéppressed = 3;

  @SuppressWarnings("UnicodeInCode")
  void method() {
    int é = 1;
  }

  void other() {
    int è = 1;
    int 中文 = 2;
    String s = "中";
    char c = '中';
  }
}
