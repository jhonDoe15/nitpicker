package demo;

import java.util.List;
import java.util.Map;

public class Emptiness {
  boolean checks(List<String> names, Map<String, String> index, String text) {
    boolean none = names.size() == 0;
    boolean some = index.size() > 0 && 0 != names.size();
    boolean single = names.size() == 1;
    boolean length = text.length() == 0;
    return none || some || single || length;
  }
}
