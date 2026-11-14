package nitpicker.effects.kinds;

import nitpicker.effects.flow.MethodFlow;

public record Call(MethodFlow flow, int index, String owner, String name, String desc) {}
