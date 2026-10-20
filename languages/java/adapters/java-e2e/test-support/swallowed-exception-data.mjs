export const LOOKUP = `package shop;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

public class Lookup {
  private static final int DEFAULT_PORT = 80;
  private static final Logger log = Logger.getLogger("lookup");
  private final List<String> errors = new ArrayList<>();
  private Throwable lastError;
  private boolean present;
  private String label;
  private int failures;

  public int port(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      return -1;
    }
  }

  public String label(String text) {
    try {
      return text.trim();
    } catch (NullPointerException e) {
      return null;
    }
  }

  public Optional<Integer> parse(String text) {
    try {
      return Optional.of(Integer.parseInt(text));
    } catch (NumberFormatException e) {
      return Optional.empty();
    }
  }

  public List<String> split(String text) {
    try {
      return List.of(text.split(","));
    } catch (NullPointerException e) {
      return Collections.emptyList();
    }
  }

  public List<String> words(String text) {
    try {
      return List.of(text.split(" "));
    } catch (NullPointerException e) {
      return new ArrayList<>();
    }
  }

  public int total(List<String> items) {
    int total = 0;
    for (String item : items) {
      try {
        total += Integer.parseInt(item);
      } catch (NumberFormatException e) {
        continue;
      }
    }
    return total;
  }

  public void remember(String text) {
    try {
      label = text.trim();
    } catch (NullPointerException e) {
      label = "none";
    }
  }

  public int portOrDefault(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      return DEFAULT_PORT;
    }
  }

  public int logAndReturn(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      log.warning("not a number");
      return -1;
    }
  }

  public void logOnly(String text) {
    try {
      Integer.parseInt(text);
    } catch (NumberFormatException e) {
      log.log(Level.WARNING, "not a number", e);
    }
  }

  public int nested(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      if (text == null) {
        return 0;
      }
      return 1;
    }
  }

  public boolean isNumber(String text) {
    try {
      Integer.parseInt(text);
      return true;
    } catch (NumberFormatException e) {
      return false;
    }
  }

  public void count(String text) {
    try {
      Integer.parseInt(text);
    } catch (NumberFormatException e) {
      failures++;
    }
  }

  public void check(String name) {
    try {
      Class.forName(name);
      present = true;
    } catch (ClassNotFoundException e) {
      present = false;
    }
  }

  public boolean exists(String name) {
    try {
      Class.forName(name);
      return true;
    } catch (ClassNotFoundException e) {
      return false;
    }
  }

  public boolean present() {
    return present;
  }

  public int portOrLength(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      return text.length();
    }
  }

  public int portOrWrap(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException(text, e);
    }
  }

  public int portOrLogAndRethrow(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      log.log(Level.WARNING, "not a number", e);
      throw e;
    }
  }

  public Optional<Integer> portOrFailure(String text) {
    try {
      return Optional.of(Integer.parseInt(text));
    } catch (NumberFormatException e) {
      return Optional.of(describe(e));
    }
  }

  public void collect(String text) {
    try {
      Integer.parseInt(text);
    } catch (NumberFormatException e) {
      errors.add(e.getMessage());
    }
  }

  public void keep(String text) {
    try {
      Integer.parseInt(text);
    } catch (NumberFormatException e) {
      lastError = e;
    }
  }

  public void pause() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  public int firstNumber(List<String> items) {
    for (String item : items) {
      try {
        return Integer.parseInt(item);
      } catch (NumberFormatException e) {
        break;
      }
    }
    return 0;
  }

  public List<String> errors() {
    return errors;
  }

  public Throwable lastError() {
    return lastError;
  }

  private int describe(Throwable error) {
    return error.getClass().getSimpleName().length();
  }
}
`;

export const FLAGGED_LOOKUP_METHODS = [
  'port',
  'label',
  'parse',
  'split',
  'words',
  'total',
  'remember',
  'portOrDefault',
  'logAndReturn',
  'logOnly',
  'nested',
  'isNumber',
  'count',
];
