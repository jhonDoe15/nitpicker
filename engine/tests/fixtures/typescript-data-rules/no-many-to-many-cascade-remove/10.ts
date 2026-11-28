function ManyToMany(options) { return options; }
class Post { @ManyToMany({ cascade: true }) tags; }