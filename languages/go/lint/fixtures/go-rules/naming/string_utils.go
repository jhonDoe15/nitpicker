package naming // want generic-name

import "strings"

type OrderManager struct { // want generic-name
	orders []string
}

type PriceHelper struct{} // want generic-name

type TransactionManager struct{}

type ContextManager struct{}

type ParserV2 struct{}

func Title(text string, manager OrderManager) string {
	return strings.ToUpper(text[:1]) + text[1:] + strings.Join(manager.orders, ",")
}
