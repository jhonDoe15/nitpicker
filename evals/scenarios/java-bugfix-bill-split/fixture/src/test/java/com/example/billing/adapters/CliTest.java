package com.example.billing.adapters;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CliTest {
  @Test
  void printsSplitToTheOutput() {
    List<String> written = new ArrayList<>();

    Cli.printSplit(600, List.of("Ann", "Ben"), written::add);

    assertEquals(List.of("Ann  $3.00\n", "Ben  $3.00\n", "Total: $6.00\n"), written);
  }
}
