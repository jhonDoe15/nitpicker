package javax.persistence;

public interface EntityManager {
    Query createQuery(String query);

    Query createNativeQuery(String query);
}
