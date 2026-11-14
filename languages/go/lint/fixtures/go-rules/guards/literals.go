package guards

import (
	"fmt"
	"log/slog"
)

const reviewState = "pending review"

type Order struct {
	State string `json:"state"`
	Kind  string `json:"kind"`
}

func States(order Order) []string {
	return []string{order.State, "in progress", "in progress", "in progress", reviewState} // want repeated-string-literal
}

func Describe(order Order) string {
	switch order.State {
	case "shipped":
		return fmt.Sprintf("order %s shipped", order.Kind)
	case "cancelled":
		return fmt.Sprintf("order %s shipped", order.State)
	}
	labels := map[string]string{"shipped": "sent", "cancelled": "dropped"}
	slog.Info("described", slog.String("order", order.Kind), "order", order.State) // want sloglint
	slog.Info("described again", slog.String("order", order.Kind))
	kinds := []Order{{Kind: "refund"}, {Kind: "refund"}, {Kind: "refund"}}
	return labels["shipped"] + labels["shipped"] + labels["shipped"] + kinds[0].Kind
}

func Routes() []string {
	return []string{"api/users", "api/users", "api/users", "50% off", "50% off", "50% off"} // want repeated-string-literal
}

func Matches(first, second, third Order) bool {
	return first.Kind == "return label" && second.Kind != "return label" && third.Kind == "return label"
}

func Ready(first, second, third Order) bool {
	return first.State == "label printed" || second.State == "label printed" || third.State == "label printed" // want repeated-string-literal
}
