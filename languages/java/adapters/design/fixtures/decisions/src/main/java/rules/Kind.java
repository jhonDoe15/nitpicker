package rules;

public enum Kind {
  BASIC,
  PLUS,
  PRO,
  TRIAL;

  private final int rank = 0;

  public int rank() {
    return rank;
  }
}
