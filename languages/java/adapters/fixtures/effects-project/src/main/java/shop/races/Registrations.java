package shop.races;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class Registrations {
  private static final long LIMIT = 10;
  private final MemberRepository members;

  public Registrations(MemberRepository members) {
    this.members = members;
  }

  public void register(String email) {
    if (members.existsByEmail(email)) {
      throw new IllegalStateException("taken");
    }
    members.save(new Member(email));
  }

  @Transactional
  public void join(String team, String email) {
    if (members.countByTeam(team) >= LIMIT) {
      throw new IllegalStateException("full");
    }
    members.save(new Member(email));
  }

  public Member findOrCreate(String email) {
    return members.findByEmail(email).orElseGet(() -> members.save(new Member(email)));
  }

  public void rename(Long id, String name) {
    Member member = members.findById(id).orElseThrow();
    if (member.getName() == null) {
      return;
    }
    member.setName(name);
    members.save(member);
  }
}
