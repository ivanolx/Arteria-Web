/**
 * Arteria — matemática pura do equalizador (sem DOM, sem Web Audio).
 *
 * Fica separada do script.js para:
 *  1. ser testada em Node (`node tests/eq-math.test.js`);
 *  2. servir de "fonte da verdade" dos parâmetros dos filtros, que no futuro
 *     também serão enviados ao firmware da placa (WebUSB / Web Serial).
 *
 * As fórmulas são as do "Audio EQ Cookbook" (RBJ), as mesmas usadas pelo
 * BiquadFilterNode do navegador. Assim, a curva desenhada na tela corresponde
 * ao que realmente está sendo aplicado ao áudio.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ArteriaMath = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const GAIN_MIN = -12;
    const GAIN_MAX = 12;

    /** Definição das 3 bandas. Alterar aqui muda áudio, gráfico e JSON exportado. */
    const FILTERS = {
        bass:   { type: 'lowshelf',  freq: 250,  q: null, label: 'Graves' },
        mid:    { type: 'peaking',   freq: 1000, q: 0.8,  label: 'Médios' },
        treble: { type: 'highshelf', freq: 4000, q: null, label: 'Agudos' }
    };
    const BAND_KEYS = Object.keys(FILTERS);

    /** Converte um valor qualquer em número finito, ou NaN. */
    function toNumber(raw) {
        if (typeof raw === 'number') return raw;
        if (typeof raw === 'string' && raw.trim() !== '') return Number(raw);
        return NaN;
    }

    /**
     * Valida e normaliza os ganhos de um preset vindo de fora (arquivo JSON,
     * localStorage...). Valores ausentes viram 0 dB; valores fora da faixa são
     * limitados a ±12 dB e arredondados para o passo de 1 dB dos sliders.
     * Lança erro se não houver nenhum valor válido ou se algum for inválido.
     */
    function sanitizeBands(input) {
        if (!input || typeof input !== 'object') {
            throw new Error('Preset sem bandas.');
        }
        let found = 0;
        const result = {};
        BAND_KEYS.forEach(key => {
            const raw = input[key];
            if (raw === undefined || raw === null) {
                result[key] = 0;
                return;
            }
            const n = toNumber(raw);
            if (!Number.isFinite(n)) {
                throw new Error(`Valor inválido para "${key}".`);
            }
            found += 1;
            result[key] = Math.min(GAIN_MAX, Math.max(GAIN_MIN, Math.round(n)));
        });
        if (found === 0) throw new Error('Preset sem bandas.');
        return result;
    }

    /**
     * Interpreta um preset em qualquer formato aceito:
     *  - Arquivo exportado: { perfil, equalizacao: { gravesDb, mediosDb, agudosDb } }
     *  - Slot interno:      { name, bands: { bass, mid, treble } }
     */
    function parsePreset(json) {
        if (!json || typeof json !== 'object') throw new Error('Formato inválido.');
        if (json.equalizacao && typeof json.equalizacao === 'object') {
            const eq = json.equalizacao;
            return {
                name: typeof json.perfil === 'string' ? json.perfil : '',
                bands: sanitizeBands({ bass: eq.gravesDb, mid: eq.mediosDb, treble: eq.agudosDb })
            };
        }
        if (json.bands) {
            return {
                name: typeof json.name === 'string' ? json.name : '',
                bands: sanitizeBands(json.bands)
            };
        }
        throw new Error('Formato inválido.');
    }

    /**
     * Coeficientes normalizados (b0,b1,b2,a1,a2) de um filtro biquad.
     * Para shelves usa slope S = 1 (mesmo comportamento do Chrome/Firefox);
     * por isso o Q só vale para o filtro "peaking".
     */
    function biquadCoefficients(type, freq, q, gainDb, sampleRate) {
        const A = Math.pow(10, gainDb / 40);
        const w0 = 2 * Math.PI * freq / sampleRate;
        const cos = Math.cos(w0);
        const sin = Math.sin(w0);
        let b0, b1, b2, a0, a1, a2;

        if (type === 'peaking') {
            const alpha = sin / (2 * q);
            b0 = 1 + alpha * A;
            b1 = -2 * cos;
            b2 = 1 - alpha * A;
            a0 = 1 + alpha / A;
            a1 = -2 * cos;
            a2 = 1 - alpha / A;
        } else {
            const alpha = sin / 2 * Math.SQRT2; // S = 1
            const t = 2 * Math.sqrt(A) * alpha;
            if (type === 'lowshelf') {
                b0 = A * ((A + 1) - (A - 1) * cos + t);
                b1 = 2 * A * ((A - 1) - (A + 1) * cos);
                b2 = A * ((A + 1) - (A - 1) * cos - t);
                a0 = (A + 1) + (A - 1) * cos + t;
                a1 = -2 * ((A - 1) + (A + 1) * cos);
                a2 = (A + 1) + (A - 1) * cos - t;
            } else if (type === 'highshelf') {
                b0 = A * ((A + 1) + (A - 1) * cos + t);
                b1 = -2 * A * ((A - 1) + (A + 1) * cos);
                b2 = A * ((A + 1) + (A - 1) * cos - t);
                a0 = (A + 1) - (A - 1) * cos + t;
                a1 = 2 * ((A - 1) - (A + 1) * cos);
                a2 = (A + 1) - (A - 1) * cos - t;
            } else {
                throw new Error(`Tipo de filtro desconhecido: ${type}`);
            }
        }
        return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
    }

    /** Ganho (em dB) de um biquad numa frequência. */
    function biquadMagnitudeDb(c, freq, sampleRate) {
        const w = 2 * Math.PI * freq / sampleRate;
        const cw = Math.cos(w), sw = Math.sin(w);
        const c2w = Math.cos(2 * w), s2w = Math.sin(2 * w);
        const nRe = c.b0 + c.b1 * cw + c.b2 * c2w;
        const nIm = -(c.b1 * sw + c.b2 * s2w);
        const dRe = 1 + c.a1 * cw + c.a2 * c2w;
        const dIm = -(c.a1 * sw + c.a2 * s2w);
        const mag2 = (nRe * nRe + nIm * nIm) / (dRe * dRe + dIm * dIm);
        return 10 * Math.log10(mag2);
    }

    /** Resposta combinada das 3 bandas (soma em dB) para uma lista de frequências. */
    function responseDb(values, freqs, sampleRate) {
        const fs = sampleRate || 48000;
        const coeffs = BAND_KEYS.map(key => {
            const f = FILTERS[key];
            return biquadCoefficients(f.type, f.freq, f.q, values[key] || 0, fs);
        });
        return freqs.map(freq =>
            coeffs.reduce((sum, c) => sum + biquadMagnitudeDb(c, freq, fs), 0)
        );
    }

    /** Frequências espaçadas logaritmicamente entre min e max (inclusive). */
    function logFrequencies(count, min, max) {
        const out = [];
        for (let i = 0; i < count; i += 1) {
            out.push(min * Math.pow(max / min, i / (count - 1)));
        }
        return out;
    }

    function formatDb(value) {
        if (value > 0) return `+${value} dB`;
        if (value < 0) return `−${Math.abs(value)} dB`;
        return '0 dB';
    }

    return {
        GAIN_MIN, GAIN_MAX, FILTERS, BAND_KEYS,
        sanitizeBands, parsePreset,
        biquadCoefficients, biquadMagnitudeDb, responseDb, logFrequencies,
        formatDb
    };
}));
