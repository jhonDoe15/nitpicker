it.skipIf('\ud800')('a', () => {});
it('b', { skip: '\udc00x' }, () => {});
it.runIf('\ud83d' + '\ude00' === '\u{1F600}')('c', () => {});
