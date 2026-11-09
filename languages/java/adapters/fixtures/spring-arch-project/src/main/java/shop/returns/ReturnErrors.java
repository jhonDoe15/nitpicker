package shop.returns;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ReturnErrors {
  @ExceptionHandler(ReturnProblem.class)
  ResponseEntity<String> problem(ReturnProblem error) {
    return ResponseEntity.status(409).body("conflict");
  }

  @ExceptionHandler
  ResponseEntity<String> fallback(Exception error) {
    if (error instanceof ReturnClosed) {
      return ResponseEntity.status(409).body("closed");
    }
    return ResponseEntity.internalServerError().build();
  }
}
