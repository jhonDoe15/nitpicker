package passes

type Settings struct {
	Limit int
}

func Ignored(settings Settings) int {
	settings.Limit = 10 // want unusedwrite
	return 0
}

func Applied(settings Settings) Settings {
	settings.Limit = 10
	return settings
}
