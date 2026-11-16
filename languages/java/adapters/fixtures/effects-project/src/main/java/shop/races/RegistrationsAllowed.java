package shop.races;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RegistrationsAllowed {
  private final MemberRepository members;
  private final SeatRepository seats;

  public RegistrationsAllowed(MemberRepository members, SeatRepository seats) {
    this.members = members;
    this.seats = seats;
  }

  @Transactional
  public void renameLocked(Long id, String name) {
    Member member = members.lockById(id).orElseThrow();
    if (member.getName() == null) {
      return;
    }
    member.setName(name);
    members.save(member);
  }

  @Transactional
  public void registerLocked(String email) {
    if (members.lockByEmail(email).isPresent()) {
      throw new IllegalStateException("taken");
    }
    members.save(new Member(email));
  }

  @Transactional(isolation = Isolation.SERIALIZABLE)
  public void registerSerializable(String email) {
    if (members.existsByEmail(email)) {
      throw new IllegalStateException("taken");
    }
    members.save(new Member(email));
  }

  public void takeSeat(Long id, String holder) {
    Seat seat = seats.findById(id).orElseThrow();
    if (seat.getHolder() != null) {
      throw new IllegalStateException("taken");
    }
    seat.setHolder(holder);
    seats.save(seat);
  }

  public void renameFound(Long id, String name) {
    Member member = members.findById(id).orElse(null);
    if (member == null) {
      throw new IllegalArgumentException("missing");
    }
    member.setName(name);
    members.save(member);
  }

  public void renameKnown(Long id, String name) {
    Member member = members.findById(id).orElseThrow();
    member.setName(name);
    members.save(member);
  }

  public void registerOther(String email) {
    if (seats.existsById(1L)) {
      throw new IllegalStateException("taken");
    }
    members.save(new Member(email));
  }

  public synchronized void registerGuarded(String email) {
    if (members.existsByEmail(email)) {
      throw new IllegalStateException("taken");
    }
    members.save(new Member(email));
  }
}

class RegistrationHelper {
  private final MemberRepository members;

  RegistrationHelper(MemberRepository members) {
    this.members = members;
  }

  public void register(String email) {
    if (members.existsByEmail(email)) {
      throw new IllegalStateException("taken");
    }
    members.save(new Member(email));
  }
}
