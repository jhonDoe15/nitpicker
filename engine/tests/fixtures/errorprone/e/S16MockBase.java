import org.mockito.Mock;

class S16MockBase {
    @Mock protected S16Mock inherited;
    @Mock(answer = "deep") protected S16Mock inheritedDeep;
    @Mock S16Mock packaged;
    @Mock public static S16Mock shared;
    S16Mock plain;
}
