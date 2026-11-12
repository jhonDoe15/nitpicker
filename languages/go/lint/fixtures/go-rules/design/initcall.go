package design

import "fmt"

var handlers = map[string]func() string{} // want mutable-package-state

var names = []string{"orders", "users"}

var registered = map[string]bool{}

var ready = make(chan bool, 1)

func init() {
	registered["orders"] = true
	fmt.Println("loaded") // want init-side-effect
	Register("users", func() string { return "users" })
	if len(registered) > 0 {
		defer fmt.Println("registered") // want init-side-effect
		ready <- true                   // want init-side-effect
	}
	go func() { // want init-side-effect unowned-goroutine
		fmt.Println("warming")
	}()
}

func Register(name string, handler func() string) {
	handlers[name] = handler
}

func Names() []string {
	return names
}
