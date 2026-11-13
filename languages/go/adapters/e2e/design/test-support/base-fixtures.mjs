export const BASE_FILES = {
  'go.mod': 'module shop\n\ngo 1.22\n',
  'nitpicker.config.json': '{ "preset": "go", "disable": ["mutation"] }\n',
  'cmd/shop/main.go': `package main

import (
	"fmt"

	"shop/internal/orders"
)

func main() {
	cart := orders.NewCart()
	fmt.Println(len(cart.Lines()))
}
`,
  'internal/orders/cart.go': `package orders

type Cart struct {
	items []string
}

func NewCart() *Cart {
	return &Cart{items: []string{"tea"}}
}

func (c *Cart) Lines() []string {
	return c.items
}

func (c *Cart) Snapshot() []string {
	return append([]string(nil), c.items...)
}
`,
  'internal/app/context.go': `package app

type Context struct {
	Clock  func() int
	Rates  map[string]int
	DB     string
	Mailer string
	Logger string
	Config string
}
`,
};
