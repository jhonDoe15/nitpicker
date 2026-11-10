package rules;

import java.util.Objects;

public class Account {
  public Kind kind;
  public String tier;
  private String region;
  private int level;

  public String getRegion() {
    return region;
  }

  public int level() {
    return level;
  }

  public boolean premium() {
    return kind == Kind.PLUS || kind == Kind.PRO;
  }

  public int fee() {
    switch (kind) {
      case BASIC:
      case TRIAL:
        return 0;
      case PLUS:
        return 5;
      default:
        return 9;
    }
  }

  public String label() {
    if ("gold".equals(tier)) {
      return "G";
    } else if (tier.equals("silver") || Objects.equals(tier, "bronze")) {
      return "S";
    } else {
      return "-";
    }
  }
}
