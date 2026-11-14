package shop.flags;

import java.util.ArrayList;
import java.util.List;

public class Notifications {
  private final List<String> sent = new ArrayList<>();
  private boolean urgentByDefault;

  public void send(String order, boolean urgent) { // violation: BooleanFlagParameter
    if (urgent) {
      sent.add("urgent " + order);
    } else {
      sent.add(order);
    }
  }

  public String label(boolean loud) { // violation: BooleanFlagParameter
    return loud ? "ORDER" : "order";
  }

  public void both(boolean first, boolean second) { // violation: BooleanFlagParameter, BooleanFlagParameter
    if (!first && second) {
      sent.clear();
    }
  }

  public void repeat(boolean again) { // violation: BooleanFlagParameter
    do {
      sent.add("again");
    } while (again);
  }

  public void defer(boolean urgent) { // violation: BooleanFlagParameter
    Runnable task = () -> {
      if (urgent) {
        sent.add("urgent");
      }
    };
    task.run();
  }

  public void passedOn(String order, boolean urgent) {
    send(order, urgent);
  }

  public void stored(boolean urgent) {
    this.urgentByDefault = urgent;
  }

  public void setUrgent(boolean urgent) {
    if (urgent) {
      sent.add("urgent");
    }
  }

  public void withRetry(boolean retry) {
    if (retry) {
      sent.add("retry");
    }
  }

  public static Notifications of(boolean urgent) {
    Notifications notifications = new Notifications();
    if (urgent) {
      notifications.sent.add("urgent");
    }
    return notifications;
  }

  public void boxed(Boolean urgent) {
    if (urgent) {
      sent.add("urgent");
    }
  }

  public void rebound(boolean urgent, String order) {
    boolean decided = urgent || order.isEmpty();
    sent.add(String.valueOf(decided));
  }

  public void compared(boolean urgent) {
    if (sent.isEmpty() == urgent) {
      sent.add("urgent");
    }
  }

  @Override
  public String toString() {
    return sent.toString();
  }

  void packagePrivate(boolean urgent) {
    if (urgent) {
      sent.add("urgent");
    }
  }

  private void hidden(boolean urgent) {
    if (urgent) {
      sent.add("urgent");
    }
  }

  protected void guarded(boolean urgent) {
    if (urgent) {
      sent.add("urgent");
    }
  }

  public void repeatTwice(boolean twice) { // violation: BooleanFlagParameter
    for (int i = 0; twice && i < 2; i++) {
      sent.add("again");
    }
  }

  public void loops(boolean twice) {
    for (int i = 0; i < 2; i++) {
      sent.add(String.valueOf(twice));
    }
  }

  static class Internal {
    public void nested(boolean urgent) {
      if (urgent) {
        System.out.println("urgent");
      }
    }
  }

  public static class Exposed {
    public void nested(boolean urgent) { // violation: BooleanFlagParameter
      if (urgent) {
        System.out.println("urgent");
      }
    }
  }
}
