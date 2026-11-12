package com.example.billing.adapters;

/** Where printed text goes. */
@FunctionalInterface
public interface Output {
  void write(String text);
}
