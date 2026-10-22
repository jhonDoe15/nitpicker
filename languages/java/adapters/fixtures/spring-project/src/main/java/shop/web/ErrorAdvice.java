package shop.web;

import java.util.Arrays;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ErrorAdvice {
  private static final Logger LOG = LoggerFactory.getLogger(ErrorAdvice.class);

  @ExceptionHandler(Exception.class)
  public ProblemDetail generic(Exception e) {
    LOG.error("failed: {}", e.getMessage(), e);
    return ProblemDetail.forStatusAndDetail(
        HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage()); // violation: SpringNoErrorLeak
  }

  @ExceptionHandler(DataAccessException.class)
  public ProblemDetail dao(DataAccessException e) {
    LOG.warn("data access failed", e);
    return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "The data could not be saved");
  }

  @ExceptionHandler(MissingItem.class)
  public ProblemDetail missing(MissingItem e) {
    return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
  }

  @ExceptionHandler(RuntimeException.class)
  public String trace(RuntimeException e) {
    return Arrays.toString(e.getStackTrace()); // violation: SpringNoErrorLeak
  }

  @ExceptionHandler(IllegalStateException.class)
  public Map<String, Object> leaky(IllegalStateException e) { // violation: SpringTypedResponse
    return Map.of();
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public Object none(IllegalArgumentException e) { // violation: SpringTypedResponse
    return null; // violation: SpringTypedResponse
  }

  public static class MissingItem extends RuntimeException {}
}
