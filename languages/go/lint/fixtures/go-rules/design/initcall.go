package design

import "fmt"

var handlers = map[string]func() string{} // want mutable-package-state

var names = []string{"orders", "users"}

var registered = map[string]bool{} // want mutable-package-state

func init() {
	registered["orders"] = true
	fmt.Println("loaded") // want init-side-effect
}

func Register(name string, handler func() string) {
	handlers[name] = handler
}

func Names() []string {
	return names
}
