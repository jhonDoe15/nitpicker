package shop.guards;

import java.util.List;

public final class Guards {
  public String ternary(String[] params) {
    return params.length > 1 ? params[2] : null; // violation: ConstantIndexBeyondGuard
  }

  public boolean conjunction(Object[] params) {
    return params.length >= 9 && (Boolean) params[9]; // violation: ConstantIndexBeyondGuard
  }

  public boolean flag(String[] args) {
    if (args.length > 3 && "--no_limit".equals(args[4])) { // violation: ConstantIndexBeyondGuard
      return true;
    }
    return false;
  }

  public String earlyReturn(String body) {
    String[] parts = body.split(" ", 2);
    if (parts.length < 1) {
      return "";
    }
    return parts[1]; // violation: ConstantIndexBeyondGuard
  }

  public String earlyThrow(String[] parts) {
    if (parts == null || parts.length <= 1) {
      throw new IllegalArgumentException("no parts");
    }
    return parts[2]; // violation: ConstantIndexBeyondGuard
  }

  public String exactLength(String[] kernel) {
    if (kernel.length == 2) {
      return kernel[2]; // violation: ConstantIndexBeyondGuard
    }
    return "";
  }

  public String fromList(List<String> names) {
    return names.size() > 1 ? names.get(2) : null; // violation: ConstantIndexBeyondGuard
  }

  public String listEarlyReturn(List<String> names) {
    if (names.size() < 1) {
      return "";
    }
    return names.get(1); // violation: ConstantIndexBeyondGuard
  }

  public String guardCovers(String[] params) {
    return params.length > 2 ? params[2] : null;
  }

  public String listGuardCovers(List<String> names) {
    return names.size() >= 3 ? names.get(2) : null;
  }

  public boolean earlyReturnCovers(String[] parts) {
    if (parts.length < 2) {
      return false;
    }
    return parts[0].equals(parts[1]);
  }

  public boolean shortCircuit(String[] args) {
    return args.length == 0 || args[0].isEmpty();
  }

  public boolean shortCircuitLong(String[] args) {
    return args.length < 3 || args[2].isEmpty();
  }

  public String reassigned(String[] params, String[] other) {
    if (params.length > 1) {
      params = other;
      return params[2];
    }
    return null;
  }

  public String variableIndex(String[] params, int at) {
    return params.length > 1 ? params[at] : null;
  }

  public String laterGuardCovers(String[] parts) {
    if (parts.length < 1) {
      return "";
    }
    return parts.length > 1 ? parts[1] : parts[0];
  }

  public String otherLengthTest(String[] parts) {
    if (parts.length == 1) {
      return parts[0];
    }
    return parts[1];
  }
}
