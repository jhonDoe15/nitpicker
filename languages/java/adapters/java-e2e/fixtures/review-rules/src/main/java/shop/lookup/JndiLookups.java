package shop.lookup;

import javax.naming.Context;
import javax.naming.InitialContext;
import javax.naming.NamingException;
import javax.naming.directory.DirContext;
import org.springframework.jndi.JndiTemplate;

public class JndiLookups {
  private final Context context;

  JndiLookups(Context context) {
    this.context = context;
  }

  Object source() throws NamingException {
    return new InitialContext().lookup("java:comp/env/jdbc/shop"); // violation: ServiceLocatorLookup
  }

  Object queue() throws NamingException {
    return context.lookup("java:comp/env/jms/orders"); // violation: ServiceLocatorLookup
  }

  Object link() throws NamingException {
    return context.lookupLink("orders"); // violation: ServiceLocatorLookup
  }

  Object template(JndiTemplate jndi) throws NamingException {
    return jndi.lookup("java:comp/env/jdbc/orders"); // violation: ServiceLocatorLookup
  }

  Object entry(DirContext directory) throws NamingException {
    return directory.lookup("cn=orders,ou=apps");
  }

  String name() throws NamingException {
    return context.getNameInNamespace();
  }
}
