package life;

public class Client {
  private final Session shared = new Session();

  public void guarded(Session session) {
    session.begin();
    try {
      session.write("a");
      session.commit();
    } catch (RuntimeException failure) {
      session.rollback();
    } finally {
      session.close();
    }
  }

  public void resource() {
    try (Session session = new Session()) {
      session.begin();
      session.write("b");
    }
  }

  public void existing(Session session) {
    try (session) {
      session.begin();
    }
  }

  public void leaked(Session session) {
    session.begin();
    session.write("c");
  }

  public void field() {
    shared.begin();
    try {
      shared.write("d");
    } finally {
      shared.rollback();
    }
  }

  public void deferred(Session session) {
    try {
      session.begin();
    } finally {
      Runnable later = () -> session.rollback();
      later.run();
    }
  }

  public Session open() {
    Session created = new Session();
    created.begin();
    return created;
  }

  public void inLambda() {
    Runnable task =
        () -> {
          Session session = new Session();
          session.begin();
          try {
            session.write("e");
          } finally {
            session.close();
          }
        };
    task.run();
  }

  public void anonymous() {
    Runnable task =
        new Runnable() {
          @Override
          public void run() {
            Session session = new Session();
            session.begin();
            try {
              helper();
            } finally {
              session.close();
            }
          }

          private void helper() {}
        };
    task.run();
  }

  public void siblings() {
    {
      Session session = new Session();
      session.begin();
    }
    {
      Session session = new Session();
      session.begin();
      try {
        session.write("f");
      } finally {
        session.close();
      }
    }
  }
}
