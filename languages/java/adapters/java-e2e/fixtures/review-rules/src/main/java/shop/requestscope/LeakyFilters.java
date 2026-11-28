package shop.requestscope;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.apache.logging.log4j.ThreadContext;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

public final class LeakyFilters {
    private LeakyFilters() {
    }

    public static class TenantFilter implements Filter {
        private final ThreadLocal<String> tenant = new ThreadLocal<>();

        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            tenant.set(((HttpServletRequest) request).getHeader("X-Tenant")); // violation: RequestThreadLocalNotCleared
            MDC.put("tenant", "acme"); // violation: RequestThreadLocalNotCleared
            chain.doFilter(request, response);
        }
    }

    public static class LocaleFilter extends OncePerRequestFilter {
        private static final InheritableThreadLocal<String> LOCALE = new InheritableThreadLocal<>();

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            LOCALE.set(request.getLocale().toString()); // violation: RequestThreadLocalNotCleared
            ThreadContext.put("locale", request.getLocale().toString()); // violation: RequestThreadLocalNotCleared
            chain.doFilter(request, response);
        }
    }
}
