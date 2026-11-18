package shop.projections;

import java.util.List;

public class MemberViews {
  private final MemberRepository members;

  public MemberViews(MemberRepository members) {
    this.members = members;
  }

  public List<String> emails(String team) {
    return members.findByTeam(team).stream().map(Member::getEmail).toList();
  }

  public boolean taken(String email) {
    return members.countByEmail(email) > 0;
  }

  public boolean known(String email) {
    return members.findByEmail(email).isPresent();
  }
}
