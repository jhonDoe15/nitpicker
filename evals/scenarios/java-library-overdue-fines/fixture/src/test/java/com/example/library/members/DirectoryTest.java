package com.example.library.members;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class DirectoryTest {
  private static final Member ADA = new Member("M1", "Ada Lovelace", Tier.STANDARD);
  private static final Member GRACE = new Member("M2", "Grace Hopper", Tier.STUDENT);

  @Test
  void findsMembersById() {
    Directory directory = new Directory(List.of(ADA, GRACE));

    assertEquals(Optional.of(GRACE), directory.find("M2"));
    assertEquals(Optional.empty(), directory.find("M3"));
  }

  @Test
  void listsMembersInTheOrderTheyJoined() {
    assertEquals(List.of(ADA, GRACE), new Directory(List.of(ADA, GRACE)).all());
  }
}
