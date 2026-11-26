package e;

/** Bidi controls: ‮ reversed ‭ and ⁦ isolate. */
class S13Bidi {
  String normal = "ok";
  String hidden = "a‮b‬";
  String escaped = "a\u202eb";
  // a comment ‫ with one
  @SuppressWarnings("UnicodeDirectionalityCharacters")
  String suppressed = "⁧";

  int été = 1; String tail = "😀‪";
}
