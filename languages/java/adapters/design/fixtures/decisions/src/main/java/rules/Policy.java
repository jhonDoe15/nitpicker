package rules;

public class Policy {
  public int discount(Account account) {
    return switch (account.kind) {
      case BASIC, TRIAL -> 0;
      case PLUS -> 5;
      case PRO -> 10;
    };
  }

  public String quota(Kind kind) {
    if (kind == Kind.BASIC || kind == Kind.TRIAL) {
      return "low";
    } else if (kind == Kind.PLUS) {
      return "mid";
    }
    return "high";
  }

  public int region(Account account) {
    switch (account.getRegion()) {
      case "eu":
      case "uk":
        return 1;
      case "us":
        return 2;
    }
    return 0;
  }

  public int levels(Account account) {
    return switch (account.level()) {
      case 1, 2 -> 1;
      default -> 0;
    };
  }

  public String cascade(Account account, Kind kind) {
    if (account.tier.equals("x")) {
      return "x";
    } else if (kind == Kind.PRO) {
      return "p";
    } else if (account.tier.equals("y")) {
      return "y";
    }
    return "";
  }

  public boolean patterns(Object value) {
    return switch (value) {
      case String text -> true;
      default -> false;
    };
  }

  public boolean local(int code, String name) {
    if (code == 3 || code == 4) {
      return name.equals("a");
    }
    return false;
  }

  public int exposed(Account account) {
    int total = 0;
    if (account.premium() && account.kind != Kind.TRIAL) {
      total += account.level();
    }
    while (account.getRegion() != null) {
      total++;
    }
    return account.tier == null ? total : 0;
  }
}
