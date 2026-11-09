package gocritic

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"
)

func Blank(text string) bool {
	return len(text) == 0 // want emptyStringTest
}

func BlankOnce(text string) bool {
	return text == ""
}

func SameName(name, other string) bool {
	return strings.ToLower(name) == other // want equalFold
}

func SameNameOnce(name, other string) bool {
	return strings.EqualFold(name, other)
}

func Found(data []byte, part string) int {
	return strings.Index(string(data), part) // want indexAlloc
}

func FoundOnce(data []byte, part string) int {
	return bytes.Index(data, []byte(part))
}

func First(text string) rune {
	return []rune(text)[0] // want preferDecodeRune
}

func FirstOnce(text string) rune {
	first, _ := utf8.DecodeRuneInString(text)
	return first
}

func Fill(buffer *bytes.Buffer, text string) {
	buffer.Write([]byte(text)) // want preferStringWriter
	buffer.WriteString(text)
	buffer.WriteRune('\n') // want preferWriteByte
	buffer.WriteByte('\n')
	buffer.WriteRune('é')
}

type Name struct{ first string }

func (name Name) String() string {
	return name.first
}

func Shown(name Name) string {
	return fmt.Sprint(name) // want redundantSprint
}

func ShownOnce(name Name) string {
	return name.String()
}

func Quoted(name string) string {
	return fmt.Sprintf(`"%s" is missing`, name) // want sprintfQuotedString
}

func QuotedOnce(name string) string {
	return fmt.Sprintf("%q is missing", name)
}

func Path(dir, file string) string {
	return strings.Join([]string{dir, file}, "/") // want stringConcatSimplify
}

func PathOnce(dir, file string) string {
	return dir + "/" + file
}

func Filled(target []byte, text string) int {
	return copy(target, []byte(text)) // want stringXbytes
}

func FilledOnce(target []byte, text string) int {
	return copy(target, text)
}

func Before(left, right string) bool {
	return strings.Compare(left, right) < 0 // want stringsCompare
}

func BeforeOnce(left, right string) bool {
	return left < right
}

var pending sync.WaitGroup

func Finished() {
	pending.Add(-1) // want wrapperFunc
}

func FinishedOnce() {
	pending.Done()
}

func Zeros(size int) []byte {
	return bytes.Repeat([]byte{0}, size) // want zeroByteRepeat
}

func ZerosOnce(size int) []byte {
	return make([]byte, size)
}

func Halves(text string) []string {
	return strings.SplitN(text, ",", 0) // want badCall
}

func HalvesOnce(text string) []string {
	return strings.SplitN(text, ",", 2)
}

func Last(values []int) int {
	return values[len(values)] // want offBy1
}

func LastOnce(values []int) int {
	return values[len(values)-1]
}

func Whole(values []int) []int {
	return values[:] // want unslice
}

func Nested(dir, file string) string {
	return dir + string(os.PathSeparator) + file // want preferFilepathJoin
}

func NestedOnce(dir, file string) string {
	return filepath.Join(dir, file)
}

func Size(value, small, large int) string {
	switch value {
	case small:
		return "small"
	case large, small: // want dupCase
		return "large"
	}
	return ""
}
