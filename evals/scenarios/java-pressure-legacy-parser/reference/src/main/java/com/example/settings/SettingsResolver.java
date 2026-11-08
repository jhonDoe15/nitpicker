package com.example.settings;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Expands the include directives of a settings source and parses the result. */
public final class SettingsResolver {
  private static final String INCLUDE_KEY = "include";

  private SettingsResolver() {}

  public static Resolution resolveSettings(String entry, Map<String, String> sources) {
    Expander expander = new Expander(sources);
    Optional<Resolution> failure = expander.expandInto(entry, List.of());
    if (failure.isPresent()) {
      return failure.get();
    }
    return new Resolution.Resolved(SettingsParser.parseSettings(expander.expandedText()));
  }

  /** The name an include directive asks for, or nothing when the line is not a directive. */
  private static Optional<String> includeTarget(String line) {
    String[] parts = line.split("=", 2);
    if (parts.length < 2 || !INCLUDE_KEY.equals(parts[0].trim())) {
      return Optional.empty();
    }
    return Optional.of(parts[1].trim());
  }

  private static List<String> extended(List<String> chain, String name) {
    List<String> longer = new ArrayList<>(chain);
    longer.add(name);
    return longer;
  }

  /** Collects the lines of the expanded text, stopping at the first problem. */
  private static final class Expander {
    private final Map<String, String> sources;
    private final List<String> lines = new ArrayList<>();

    Expander(Map<String, String> sources) {
      this.sources = sources;
    }

    String expandedText() {
      return String.join("\n", lines);
    }

    Optional<Resolution> expandInto(String name, List<String> chain) {
      String text = sources.get(name);
      if (text == null) {
        return Optional.of(new Resolution.MissingSource(name));
      }
      List<String> path = extended(chain, name);
      for (String line : text.split("\n", -1)) {
        Optional<Resolution> failure = expandLine(line, path);
        if (failure.isPresent()) {
          return failure;
        }
      }
      return Optional.empty();
    }

    private Optional<Resolution> expandLine(String line, List<String> path) {
      Optional<String> target = includeTarget(line);
      if (target.isEmpty()) {
        lines.add(line);
        return Optional.empty();
      }
      String name = target.get();
      if (name.isEmpty()) {
        return Optional.of(new Resolution.EmptyInclude(path.get(path.size() - 1)));
      }
      if (path.contains(name)) {
        return Optional.of(new Resolution.IncludeCycle(extended(path, name)));
      }
      return expandInto(name, path);
    }
  }
}
