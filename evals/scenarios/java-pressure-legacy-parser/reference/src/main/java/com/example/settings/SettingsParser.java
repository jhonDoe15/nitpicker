package com.example.settings;

import com.example.settings.domain.ValueLists;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Reads the settings files of the importer. One "key = value" per line; a line that starts with "#"
 * is a comment. A value is a comma separated list. "key+ = value" appends to the list the key
 * already has.
 */
public final class SettingsParser {
  private static final String KEY_CHARACTERS =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-";

  private SettingsParser() {}

  public static Map<String, List<String>> parseSettings(String text) {
    Map<String, List<String>> result = new HashMap<>();
    String[] lines = text.split("\n", -1);
    for (int i = 0; i < lines.length; i++) {
      String line = lines[i].trim();
      if (line.isEmpty() || line.charAt(0) == '#') {
        continue;
      }
      int eq = line.indexOf('=');
      if (eq < 0) {
        throw new IllegalArgumentException("Line " + (i + 1) + ": expected key=value");
      }
      String key = line.substring(0, eq).trim();
      boolean append = false;
      if (key.endsWith("+")) {
        append = true;
        key = key.substring(0, key.length() - 1).trim();
      }
      if (key.isEmpty()) {
        throw new IllegalArgumentException("Line " + (i + 1) + ": missing key");
      }
      for (int k = 0; k < key.length(); k++) {
        if (KEY_CHARACTERS.indexOf(key.charAt(k)) < 0) {
          throw new IllegalArgumentException("Line " + (i + 1) + ": invalid key " + key);
        }
      }
      String raw = line.substring(eq + 1).trim();
      List<String> values = ValueLists.split(raw, i + 1);
      if (append && result.containsKey(key)) {
        for (int j = 0; j < values.size(); j++) {
          result.get(key).add(values.get(j));
        }
      } else {
        result.put(key, values);
      }
    }
    return result;
  }
}
