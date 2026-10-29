package com.example.settings;

/** Where printed text goes. */
@FunctionalInterface
public interface Output {
  void write(String text);
}
