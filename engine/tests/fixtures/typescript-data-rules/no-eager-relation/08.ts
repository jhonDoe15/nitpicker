function ManyToOne(options) { return options; }
class Order { @ManyToOne({ eager: true }) customer; }