package shop.returns;

import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

public final class Returns {
  private Returns() {}
}

class ReturnNotFound extends RuntimeException {
  ReturnNotFound(Long id) {
    super("Return " + id);
  }

  ReturnNotFound() {
    super("Return");
  }
}

class ReturnProblem extends RuntimeException {}

class ReturnLocked extends ReturnProblem {}

@ResponseStatus(HttpStatus.GONE)
class ReturnExpired extends RuntimeException {}

class ReturnClosed extends RuntimeException {}

class ReturnMismatch extends TypeMismatchException {
  ReturnMismatch() {
    super("x", Long.class);
  }
}

class ReturnGone extends RuntimeException {}

class ReturnRequest {
  ReturnRequest(Long id) {
    if (id < 0) {
      throw new ReturnNotFound(id);
    }
  }
}

final class Orders {
  static final class NotFound extends RuntimeException {}

  private Orders() {}
}

final class Users {
  static final class NotFound extends RuntimeException {}

  private Users() {}
}
