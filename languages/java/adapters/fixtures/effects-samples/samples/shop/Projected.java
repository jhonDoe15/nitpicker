package shop;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Transient;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.repository.CrudRepository;

@Entity
class Member {
  @Id Long id;
  String email;
  String name;

  @Transient String label;

  String getEmail() {
    return email;
  }

  String getName() {
    return name;
  }

  String getLabel() {
    return label;
  }

  String getDisplay() {
    return name + " <" + email + ">";
  }
}

interface Summary {
  String getEmail();
}

interface MemberRepository extends CrudRepository<Member, Long> {
  List<Member> findByTeamId(Long teamId);

  long countByEmail(String email);

  Optional<Member> findByEmail(String email);

  Member findByName(String name);

  Long findIdByEmail(String email);

  Summary findSummaryByEmail(String email);

  Optional<Summary> findOptionalByEmail(String email);
}

class Projected {
  MemberRepository members;

  List<String> emails(Long team) {
    return members.findByTeamId(team).stream().map(Member::getEmail).toList();
  }

  Set<String> lambdaEmails(Long team) {
    List<Member> found = members.findByTeamId(team);
    return found.stream().map(member -> member.getEmail()).collect(Collectors.toSet());
  }

  List<String> looped(Long team) {
    List<String> emails = new ArrayList<>();
    for (Member member : members.findByTeamId(team)) {
      emails.add(member.getEmail());
    }
    return emails;
  }

  boolean taken(String email) {
    return members.countByEmail(email) > 0;
  }

  boolean exists(String email) {
    return members.findByEmail(email).isPresent();
  }

  boolean named(String name) {
    return members.findByName(name) != null;
  }

  List<String> computed(Long team) {
    return members.findByTeamId(team).stream().map(Member::getDisplay).toList();
  }

  List<String> transientColumn(Long team) {
    return members.findByTeamId(team).stream().map(Member::getLabel).toList();
  }

  List<String> twoColumns(Long team) {
    return members.findByTeamId(team).stream().map(member -> member.getEmail() + member.getName()).toList();
  }

  List<Member> whole(Long team) {
    List<Member> found = members.findByTeamId(team);
    found.forEach(member -> member.getEmail());
    return found;
  }

  String reused(String email) {
    Optional<Member> found = members.findByEmail(email);
    return found.isPresent() ? found.get().getName() : "";
  }

  long counted(String email) {
    return members.countByEmail(email);
  }

  boolean viaExists(String email) {
    return members.existsById(1L);
  }

  boolean atLeastOne(String email) {
    return members.countByEmail(email) >= 1;
  }

  boolean none(String email) {
    return members.countByEmail(email) == 0;
  }

  boolean duplicated(String email) {
    return members.countByEmail(email) > 1;
  }

  boolean exactlyOne(String email) {
    return members.countByEmail(email) == 1;
  }

  boolean projectedId(String email) {
    return members.findIdByEmail(email) != null;
  }

  boolean projectedSummary(String email) {
    return members.findSummaryByEmail(email) != null;
  }

  boolean projectedOptional(String email) {
    return members.findOptionalByEmail(email).isPresent();
  }

  List<String> escaping(Long team) {
    List<String> emails = new ArrayList<>();
    List<Member> kept = new ArrayList<>();
    for (Member member : members.findByTeamId(team)) {
      emails.add(member.getEmail());
      kept.add(member);
    }
    return emails;
  }
}
