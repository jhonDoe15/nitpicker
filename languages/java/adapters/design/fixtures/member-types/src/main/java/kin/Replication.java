package kin;

public class Replication<Request, Response> {
  public class Reference {
    Request request;
  }

  public static class Helper {
    Replication<String, Integer>.Reference held;

    void execute(Replication<String, Integer>.Reference reference, int attempt) {
      held = reference;
    }

    Replication<String, Integer>.Reference current() {
      return held;
    }
  }
}
