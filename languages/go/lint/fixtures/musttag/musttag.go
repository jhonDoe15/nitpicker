package musttag

import "encoding/json"

type Order struct {
	ID    string
	Total int
}

type Invoice struct {
	ID    string `json:"id"`
	Total int    `json:"total"`
}

func EncodeOrder(order Order) ([]byte, error) {
	return json.Marshal(order) // want musttag
}

func EncodeInvoice(invoice Invoice) ([]byte, error) {
	return json.Marshal(invoice)
}
