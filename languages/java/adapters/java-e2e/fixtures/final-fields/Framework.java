package demo;

import jakarta.persistence.Entity;
import org.springframework.beans.factory.annotation.Autowired;

@Entity
public class Framework {
  private String stored;

  public Framework(String stored) {
    this.stored = stored;
  }

  public String stored() {
    return stored;
  }
}

@lombok.Data
class Generated {
  private String text;

  Generated(String text) {
    this.text = text;
  }
}

class Wired {
  @Autowired private String injected;
  private String ready; // violation: FieldCanBeFinal

  Wired(String ready) {
    this.ready = ready;
  }

  String value() {
    return injected + ready;
  }
}
