// Testes da matemática do equalizador. Rodar com: node tests/eq-math.test.js
'use strict';
const assert = require('node:assert/strict');
const M = require('../eq-math.js');

const near = (actual, expected, tol, msg) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${msg}: esperado ${expected} ± ${tol}, obtido ${actual.toFixed(3)}`);

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
}

test('curva plana quando tudo está em 0 dB', () => {
    const freqs = M.logFrequencies(64, 20, 20000);
    M.responseDb({ bass: 0, mid: 0, treble: 0 }, freqs, 48000)
        .forEach(db => near(db, 0, 1e-9, 'resposta plana'));
});

test('graves +6 dB: sobe nos graves, ~0 dB nos agudos', () => {
    const [low, high] = M.responseDb({ bass: 6, mid: 0, treble: 0 }, [20, 15000], 48000);
    near(low, 6, 0.3, '20 Hz');
    near(high, 0, 0.3, '15 kHz');
});

test('agudos -9 dB: desce nos agudos, ~0 dB nos graves', () => {
    const [low, high] = M.responseDb({ bass: 0, mid: 0, treble: -9 }, [30, 18000], 48000);
    near(low, 0, 0.3, '30 Hz');
    near(high, -9, 0.4, '18 kHz');
});

test('médios +8 dB: pico exato em 1 kHz', () => {
    const [mid, low, high] = M.responseDb({ bass: 0, mid: 8, treble: 0 }, [1000, 30, 15000], 48000);
    near(mid, 8, 0.01, '1 kHz');
    near(low, 0, 0.3, '30 Hz');
    near(high, 0, 0.3, '15 kHz');
});

test('shelves valem metade do ganho na frequência de corte', () => {
    const [atBass] = M.responseDb({ bass: 12, mid: 0, treble: 0 }, [250], 48000);
    near(atBass, 6, 0.2, 'lowshelf @250 Hz');
    const [atTreble] = M.responseDb({ bass: 0, mid: 0, treble: 12 }, [4000], 48000);
    near(atTreble, 6, 0.2, 'highshelf @4 kHz');
});

test('sanitizeBands limita, arredonda e preenche ausentes com 0', () => {
    assert.deepEqual(M.sanitizeBands({ bass: 99, mid: -50, treble: '3.6' }), { bass: 12, mid: -12, treble: 4 });
    assert.deepEqual(M.sanitizeBands({ bass: 5 }), { bass: 5, mid: 0, treble: 0 });
});

test('sanitizeBands rejeita lixo', () => {
    assert.throws(() => M.sanitizeBands(null));
    assert.throws(() => M.sanitizeBands({}));
    assert.throws(() => M.sanitizeBands({ bass: 'abc' }));
    assert.throws(() => M.sanitizeBands({ bass: NaN }));
    assert.throws(() => M.sanitizeBands({ bass: true }));
});

test('parsePreset aceita o formato exportado e o formato de slot', () => {
    const exported = { perfil: 'Voz em foco', equalizacao: { gravesDb: -4, mediosDb: 6, agudosDb: 2 } };
    assert.deepEqual(M.parsePreset(exported), { name: 'Voz em foco', bands: { bass: -4, mid: 6, treble: 2 } });
    const slot = { name: 'Meu', bands: { bass: 1, mid: 2, treble: 3 } };
    assert.deepEqual(M.parsePreset(slot), { name: 'Meu', bands: { bass: 1, mid: 2, treble: 3 } });
    assert.throws(() => M.parsePreset({ foo: 1 }));
    assert.throws(() => M.parsePreset('texto'));
});

test('formatDb', () => {
    assert.equal(M.formatDb(0), '0 dB');
    assert.equal(M.formatDb(5), '+5 dB');
    assert.equal(M.formatDb(-3), '−3 dB');
});

console.log(`\n${passed} testes passaram.`);
