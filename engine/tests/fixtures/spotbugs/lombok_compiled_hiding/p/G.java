package p;
import lombok.Builder;
public class G {
    @Builder(builderMethodName = "make")
    public static G create(int x) { return new G(); }
    public static GBuilderLike make() { return null; }
    static class GBuilderLike {}
}
