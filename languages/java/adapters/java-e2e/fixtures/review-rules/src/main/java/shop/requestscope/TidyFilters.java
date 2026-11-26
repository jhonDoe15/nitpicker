package shop.requestscope;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

public final class TidyFilters {
    private TidyFilters() {
    }

    public static final class TenantHolder {
        public static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

        private TenantHolder() {
        }

        public static String current() {
            return CURRENT.get();
        }

        public static void clear() {
            CURRENT.remove();
        }
    }

    public static class RemovingFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            TenantHolder.CURRENT.set(request.getHeader("X-Tenant"));
            MDC.put("tenant", request.getHeader("X-Tenant"));
            try {
                chain.doFilter(request, response);
            } finally {
                TenantHolder.CURRENT.remove();
                MDC.remove("tenant");
            }
        }
    }

    public static class HelperClearFilter implements Filter {
        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            TenantHolder.CURRENT.set(((HttpServletRequest) request).getHeader("X-Tenant"));
            try {
                chain.doFilter(request, response);
            } finally {
                TenantHolder.clear();
            }
        }
    }

    public static class ClosingFilter implements Filter {
        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            try (MDC.MDCCloseable ignored = MDC.putCloseable("tenant", "acme")) {
                chain.doFilter(request, response);
            }
        }
    }

    public static class RestoringFilter implements Filter {
        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            String previous = TenantHolder.current();
            try {
                chain.doFilter(request, response);
            } finally {
                TenantHolder.CURRENT.set(previous);
                MDC.clear();
            }
        }
    }

    public static class SavingFilter extends OncePerRequestFilter {
        private static final ThreadLocal<String> LOCALE = new ThreadLocal<>();
        private static final String KEY = "tenant";

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            String previous = LOCALE.get();
            String previousTenant = MDC.get(KEY);
            LOCALE.set(request.getLocale().toString());
            MDC.put(KEY, request.getHeader("X-Tenant"));
            try {
                chain.doFilter(request, response);
            } finally {
                LOCALE.set(previous);
                MDC.put(KEY, previousTenant);
            }
        }
    }

    public static class ConstantKeyFilter extends OncePerRequestFilter {
        private static final String KEY = "tenant";

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            MDC.put(KEY, request.getHeader("X-Tenant"));
            try {
                chain.doFilter(request, response);
            } finally {
                MDC.remove("tenant");
            }
        }
    }

    public static class PlainFilter implements Filter {
        private final ThreadLocal<String> scratch = new ThreadLocal<>();

        public void remember(String value) {
            scratch.set(value);
            MDC.put("scratch", value);
        }

        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            chain.doFilter(request, response);
        }
    }
}
