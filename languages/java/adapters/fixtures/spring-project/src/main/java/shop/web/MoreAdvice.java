package shop.web;

import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class MoreAdvice {
  private static final Logger LOG = LoggerFactory.getLogger(MoreAdvice.class);

  @ExceptionHandler(Exception.class)
  ProblemDetail logged(Exception ex) {
    String message = ex.getMessage();
    LOG.error("failed: {}", message, ex);
    return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error");
  }

  @ExceptionHandler(RuntimeException.class)
  ProblemDetail returned(RuntimeException ex) {
    String detail = "failed: " + ex.getMessage(); // violation: SpringNoErrorLeak
    return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, detail);
  }

  @ExceptionHandler(Throwable.class)
  ResponseEntity<String> concatenated(Throwable ex) {
    return ResponseEntity.internalServerError().body("" + ex); // violation: SpringNoErrorLeak
  }

  @ExceptionHandler(IllegalArgumentException.class)
  ProblemDetail valueOf(IllegalArgumentException ex) {
    ProblemDetail detail = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
    detail.setDetail(String.valueOf(ex)); // violation: SpringNoErrorLeak
    return detail;
  }

  @ExceptionHandler(IOException.class)
  ProblemDetail cause(IOException ex) {
    return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, ex.getCause().getMessage()); // violation: SpringNoErrorLeak
  }

  @ExceptionHandler(IllegalStateException.class)
  ProblemDetail className(IllegalStateException ex) {
    LOG.error("state", ex);
    String kind = String.valueOf(ex.getClass().getSimpleName());
    return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Conflict " + kind.length());
  }
}
