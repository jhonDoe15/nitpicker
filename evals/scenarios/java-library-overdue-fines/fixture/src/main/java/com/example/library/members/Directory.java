package com.example.library.members;

import java.util.List;
import java.util.Optional;

/** The members of the library, in the order they joined. */
public final class Directory {
  private final List<Member> members;

  public Directory(List<Member> members) {
    this.members = List.copyOf(members);
  }

  public Optional<Member> find(String id) {
    return members.stream().filter(member -> member.id().equals(id)).findFirst();
  }

  public List<Member> all() {
    return members;
  }
}
