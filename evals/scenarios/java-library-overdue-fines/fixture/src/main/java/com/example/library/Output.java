package com.example.library;

/** Where printed text goes. */
@FunctionalInterface
public interface Output {
  void write(String text);
}
