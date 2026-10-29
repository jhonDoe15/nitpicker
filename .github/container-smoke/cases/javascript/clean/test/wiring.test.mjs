import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/main/composition-root.mjs';
import { pad } from '../src/main/features/greeting/domain/pad.cjs';

describe('wiring', () => {
  it('wires the greeting to standard output', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    main(['Ada']);
    expect(write).toHaveBeenCalledWith('A Hi, Ada!\n');
    write.mockRestore();
  });

  it('pads with the CommonJS domain helper', () => {
    expect(pad('7', 3)).toBe('  7');
  });
});
