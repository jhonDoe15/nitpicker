package nilbranch

import (
	"errors"
	"log"
	"os"
)

const missing = "missing item"

func Returns(item *Item) string {
	if item == nil {
		log.Println(missing)
		return ""
	}
	return item.Label
}

func Panics(item *Item) string {
	if item == nil {
		panic(missing) // want panic-for-failure
	}
	return item.Label
}

func Exits(item *Item) string {
	if item == nil {
		log.Println(missing)
		os.Exit(1) // want deep-exit
	}
	return item.Label
}

func Fatal(item *Item) string {
	if item == nil {
		log.Fatal(missing) // want deep-exit
	}
	return item.Label
}

func Replaced(item *Item) string {
	if item == nil {
		log.Println(missing)
		item = &Item{Label: "default"}
	}
	return item.Label
}

func Alternative(item *Item) string {
	label := ""
	if item == nil {
		log.Println(missing)
	} else {
		label = item.Label
	}
	return label
}

func Continues(items []*Item) []string {
	var labels []string
	for _, item := range items {
		if item == nil {
			log.Println(missing)
			continue
		}
		labels = append(labels, item.Label)
	}
	return labels
}

func Silent(item *Item) string {
	if item == nil { // want SA9003
	}
	return item.Label
}

func GuardedAgain(item *Item) string {
	if item == nil {
		log.Println(missing)
	}
	if item != nil {
		return item.Label
	}
	return ""
}

func OtherValue(item, other *Item) string {
	if item == nil {
		log.Println(missing)
	}
	return other.Label
}

func Compound(item *Item, limit int) string {
	if item == nil && limit > 0 {
		log.Println(missing)
	}
	return item.Label
}

func Deferred(item *Item) func() string {
	if item == nil {
		log.Println(missing)
	}
	return func() string { return "later" }
}

func Reassigned(err error) error {
	if err == nil {
		log.Println(missing)
	}
	err = errors.Join(err, errors.New("more"))
	return err
}

func NilSafe(item *Item) bool {
	if item == nil {
		log.Println(missing)
	}
	return item == nil
}

var shared *Item // want mutable-package-state

func load() { shared = &Item{} }

func (w *Writer) connect() { w.Name = new(string) }

func (w *Writer) Lazy() int {
	if w.Name == nil {
		w.connect()
	}
	return len(*w.Name)
}

func LazyGlobal() string {
	if shared == nil {
		load()
	}
	return shared.Label
}
