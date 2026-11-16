package shop.projections;

import java.util.List;

public class MemberViewsAllowed {
  private final MemberRepository members;

  public MemberViewsAllowed(MemberRepository members) {
    this.members = members;
  }

  public List<String> twoColumns(String team) {
    return members.findByTeam(team).stream().map(member -> member.getEmail() + member.getName()).toList();
  }

  public List<String> transientColumn(String team) {
    return members.findByTeam(team).stream().map(Member::getLabel).toList();
  }

  public long howMany(String email) {
    return members.countByEmail(email);
  }

  public String reused(String email) {
    var found = members.findByEmail(email);
    return found.isPresent() ? found.get().getName() : "";
  }
}
