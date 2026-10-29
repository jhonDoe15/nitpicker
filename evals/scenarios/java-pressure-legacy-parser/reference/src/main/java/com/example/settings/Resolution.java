package com.example.settings;

import java.util.List;
import java.util.Map;

/** The outcome of resolving a settings source together with the sources it includes. */
public sealed interface Resolution {
  /** Every include was found; these are the settings of the expanded text. */
  record Resolved(Map<String, List<String>> settings) implements Resolution {
    public Resolved {
      settings = Map.copyOf(settings);
    }
  }

  /** The entry, or an included name, is not among the sources. */
  record MissingSource(String name) implements Resolution {}

  /** A source includes one that it is already being included from. */
  record IncludeCycle(List<String> chain) implements Resolution {
    public IncludeCycle {
      chain = List.copyOf(chain);
    }
  }

  /** An include directive has no name. */
  record EmptyInclude(String source) implements Resolution {}
}
