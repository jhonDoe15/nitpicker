package shop.proxies;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
public class TracingAspect {
  @Around("@annotation(traced) && execution(public * shop..*(..))")
  public Object trace(ProceedingJoinPoint point, Traced traced) throws Throwable {
    return point.proceed();
  }
}
