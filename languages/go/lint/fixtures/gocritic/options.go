package gocritic

import "flag"

type Panel struct{ width, height int }

type Option func(*Panel)

func Width(width int) Option { return func(panel *Panel) { panel.width = width } }

func Height(height int) Option { return func(panel *Panel) { panel.height = height } }

func NewPanel(options ...Option) *Panel {
	panel := &Panel{}
	for _, option := range options {
		option(panel)
	}
	return panel
}

func Wide() *Panel {
	return NewPanel(Width(10), Height(2), Width(10)) // want dupOption
}

func Tall() *Panel {
	return NewPanel(Width(10), Height(20))
}

var verbose = flag.Bool(" verbose", false, "print more") // want flagName

var quiet = *flag.Bool("quiet", false, "print less") // want flagDeref

var debug bool

func Flags() bool {
	flag.BoolVar(&debug, "debug", false, "print debug output")
	return *verbose || quiet || debug
}
