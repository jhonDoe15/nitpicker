package shop;

import org.springframework.stereotype.Component;

@Component
public class Greeter {
    public String greet(String name) {
        return "Hello, " + name;
    }
}
