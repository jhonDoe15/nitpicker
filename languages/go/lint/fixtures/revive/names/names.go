package names

import (
	"strings"
	"time"
	runeCount "unicode/utf8" // want import-alias-naming
	utf16 "unicode/utf16"    // want redundant-import-alias
)

func Pair(text string) (int, int) { // want confusing-results
	return len(text), runeCount.RuneCountInString(text)
}

func Named(text string) (bytes, runes int) {
	return len(text), runeCount.RuneCountInString(text)
}

func Started() int64 {
	created := time.Now().Unix() // want epoch-naming
	return created
}

func StartedSec() int64 {
	createdSec := time.Now().Unix()
	return createdSec
}

func Local(text string) int {
	Size := len(text) // want unexported-naming
	return Size
}

func Builtin(values []int) int {
	len := 0 // want redefines-builtin-id
	for range values {
		len++
	}
	return len
}

func Shadow(text string) string {
	strings := text + "!" // want import-shadowing
	return strings
}

func Upper(text string) string {
	return strings.ToUpper(text)
}

func Encoded(text string) []uint16 {
	return utf16.Encode([]rune(text))
}

type Counter struct {
	count int
}

func (c *Counter) GetCount() { // want get-return
	c.count++
}

func (c *Counter) Count() int {
	return c.count
}

type entry struct{}

func Entry() *entry { // want unexported-return
	return &entry{}
}

type Entries struct{}

func NewEntries() *Entries {
	return &Entries{}
}

type Wrapper struct {
	Inner struct { // want nested-structs
		Name string
	}
}

type Plain struct {
	Inner Entries
}

type Tagged struct {
	Name string `json:"name,inline"` // want struct-tag
	Size int    `json:"size,omitempty"`
}

type NamesIndex struct{} // want exported

type Index struct{}

func Spaced(text string) string { // want empty-lines

	return text + "!"
}
