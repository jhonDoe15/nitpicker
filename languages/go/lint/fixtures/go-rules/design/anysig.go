package design

import (
	"database/sql"
	"fmt"
	"strconv"
)

func Format(value any) string { // want any-in-exported-signature
	switch typed := value.(type) {
	case int:
		return strconv.Itoa(typed)
	case string:
		return typed
	}
	return ""
}

func FormatInt(value int) string {
	return strconv.Itoa(value)
}

func Show[T fmt.Stringer](value T) string {
	return value.String()
}

func Print(format string, arguments ...any) string {
	return fmt.Sprintf(format, arguments...)
}

func Encode(value any) string {
	return fmt.Sprint(value)
}

func Labeled(value any) bool {
	_, ok := value.(fmt.Stringer)
	return ok
}

type Cents int64

func (cents *Cents) Scan(source any) error {
	switch typed := source.(type) {
	case int64:
		*cents = Cents(typed)
		return nil
	case nil:
		*cents = 0
		return nil
	}
	return fmt.Errorf("scan cents from %T", source)
}

var _ sql.Scanner = (*Cents)(nil)

type hidden struct{}

func (hidden) Exported(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func Hidden(value any) string {
	return hidden{}.Exported(value)
}
