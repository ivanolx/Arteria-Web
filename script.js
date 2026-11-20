'use strict';

/* ==========================================================================
   Arteria Web Companion — script principal
   Depende de eq-math.js (ArteriaMath), carregado antes no index.html.
   ========================================================================== */

const { FILTERS, BAND_KEYS, GAIN_MIN, GAIN_MAX, sanitizeBands, parsePreset, responseDb, formatDb } = ArteriaMath;

/* ---------- Referências do DOM ---------- */
const bands = [
    { key: 'bass', input: document.getElementById('bass'), output: document.getElementById('val-bass') },
    { key: 'mid', input: document.getElementById('mid'), output: document.getElementById('val-mid') },
    { key: 'treble', input: document.getElementById('treble'), output: document.getElementById('val-treble') }
];

const presetButtons = [...document.querySelectorAll('.preset-button')];
const activeProfile = document.getElementById('active-profile');
const profileStatus = document.getElementById('profile-status');
const toast = document.getElementById('toast');
const canvas = document.getElementById('spectrum-canvas');

const storageKey = 'arteria-equalizer-settings';
const slotsKeyPrefix = 'arteria-slot-';
const SLOT_COUNT = 3;
const MAX_JSON_BYTES = 100 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

let toastTimeout;

/* ---------- Armazenamento seguro (localStorage pode lançar erro em aba privada) ---------- */
const storage = {
    get(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    remove(key) {
        try { window.localStorage.removeItem(key); } catch (e) { /* ignora */ }
    }
};

/* ==========================================================================
   Estado e utilidades do equalizador
   ========================================================================== */

function getValues() {
    return Object.fromEntries(bands.map(({ key, input }) => [key, Number(input.value)]));
}

function setTrack(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const zero = ((0 - min) / (max - min)) * 100;
    const position = ((value - min) / (max - min)) * 100;
    const track = value < 0
        ? `linear-gradient(to right, #2d2245 0%, #2d2245 ${position}%, #a855f7 ${position}%, #a855f7 ${zero}%, #2d2245 ${zero}%, #2d2245 100%)`
        : `linear-gradient(to right, #2d2245 0%, #2d2245 ${zero}%, #a855f7 ${zero}%, #a855f7 ${position}%, #2d2245 ${position}%, #2d2245 100%)`;

    input.style.background = track;
}

function showToast(message) {
    window.clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimeout = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function findMatchingPreset(values) {
    return presetButtons.find(button =>
        bands.every(({ key }) => Number(button.dataset[key]) === values[key])
    );
}

/** Nome automático para slots: nome do preset ou resumo "G+3 M0 A−2". */
function describeValues(values) {
    const preset = findMatchingPreset(values);
    if (preset) return preset.dataset.name;
    const short = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
    return `G${short(values.bass)} M${short(values.mid)} A${short(values.treble)}`;
}

/* ==========================================================================
   Gráfico: curva real do EQ + analisador de espectro ao vivo
   ========================================================================== */

const GRAPH_MIN_HZ = 20;
const GRAPH_MAX_HZ = 20000;
const GRAPH_RANGE_DB = 15;           // eixo vertical: ±15 dB
const GRAPH_LABELS_HZ = [100, 1000, 10000];
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function formatHz(hz) {
    return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

function drawGraph() {
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width === 0 || height === 0) return;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padY = 10;
    const centerY = height / 2;
    const dbToY = db => centerY - (Math.max(-GRAPH_RANGE_DB, Math.min(GRAPH_RANGE_DB, db)) / GRAPH_RANGE_DB) * (height / 2 - padY);
    const logSpan = Math.log(GRAPH_MAX_HZ / GRAPH_MIN_HZ);
    const hzToX = hz => (Math.log(hz / GRAPH_MIN_HZ) / logSpan) * width;
    const xToHz = x => GRAPH_MIN_HZ * Math.exp((x / width) * logSpan);

    ctx.font = '9px "DM Sans", "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';

    // Grade: linhas verticais (100 Hz, 1 kHz, 10 kHz) e horizontais (±12 dB, 0 dB)
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(45, 34, 69, .8)';
    ctx.fillStyle = '#76698b';
    GRAPH_LABELS_HZ.forEach(hz => {
        const x = Math.round(hzToX(hz)) + .5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillText(`${formatHz(hz)}Hz`, x + 4, height - 7);
    });
    [GAIN_MAX, 0, GAIN_MIN].forEach(db => {
        const y = Math.round(dbToY(db)) + .5;
        ctx.strokeStyle = db === 0 ? '#2d2245' : 'rgba(45, 34, 69, .5)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.textAlign = 'left';
        // rótulo fica abaixo da linha de +12 dB e acima das outras, para não sair do canvas
        ctx.fillText(db > 0 ? `+${db}` : String(db), 4, db > 0 ? y + 7 : y - 7);
    });

    // Analisador (áudio pós-EQ), só enquanto toca
    if (audio.playing && audio.nodes && !reduceMotion) {
        const { analyser } = audio.nodes;
        const data = audio.freqData;
        analyser.getFloatFrequencyData(data);
        const nyquist = audio.ctx.sampleRate / 2;

        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 2) {
            const bin = Math.min(data.length - 1, Math.round((xToHz(x) / nyquist) * data.length));
            const level = Math.max(0, Math.min(1, (data[bin] + 100) / 70)); // -100 dB..-30 dB
            ctx.lineTo(x, height - level * (height - padY));
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, 0, 0, height);
        fill.addColorStop(0, 'rgba(6, 182, 212, .35)');
        fill.addColorStop(1, 'rgba(6, 182, 212, .04)');
        ctx.fillStyle = fill;
        ctx.fill();
    }

    // Curva do EQ: resposta real dos 3 filtros
    const sampleRate = audio.ctx ? audio.ctx.sampleRate : 48000;
    const step = 3;
    const xs = [];
    for (let x = 0; x <= width; x += step) xs.push(x);
    const dbs = responseDb(getValues(), xs.map(xToHz), sampleRate);

    ctx.beginPath();
    xs.forEach((x, i) => (i === 0 ? ctx.moveTo(x, dbToY(dbs[i])) : ctx.lineTo(x, dbToY(dbs[i]))));

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#06b6d4');
    gradient.addColorStop(0.5, '#a855f7');
    gradient.addColorStop(1, '#c084fc');

    // Com o EQ desligado (A/B) a curva fica tracejada e apagada: mostra o que seria aplicado
    ctx.save();
    if (!audio.eqOn) {
        ctx.globalAlpha = 0.35;
        ctx.setLineDash([6, 5]);
    }
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = audio.eqOn ? 8 : 0;
    ctx.stroke();
    ctx.restore();
}

let rafId = 0;
function graphLoop() {
    drawGraph();
    rafId = audio.playing ? window.requestAnimationFrame(graphLoop) : 0;
}
function syncGraphLoop() {
    if (audio.playing && !rafId && !reduceMotion) {
        rafId = window.requestAnimationFrame(graphLoop);
    } else if (!audio.playing) {
        drawGraph();
    }
}

window.addEventListener('resize', drawGraph);

/* ==========================================================================
   Motor de áudio (Web Audio API)

   fonte → entrada → graves → médios → agudos → limiter → volume → analisador → saída
   Fontes: ruído rosa gerado, arquivo de áudio local ou microfone.
   ========================================================================== */

const audio = {
    ctx: null,
    nodes: null,
    freqData: null,
    source: null,          // nó de fonte ativo
    sourceType: 'noise',   // 'noise' | 'file' | 'mic'
    stream: null,          // MediaStream do microfone
    fileBuffer: null,      // AudioBuffer decodificado
    fileName: '',
    noiseBuffer: null,
    playing: false,
    eqOn: true,
    limiterOn: true,
    volume: 55             // 0..100 (curva quadrática → ganho linear)
};

const ui = {
    heroLabel: document.getElementById('preview-text'),
    heroIcon: document.querySelector('#btn-audio-preview .preview-icon'),
    panelPlay: document.getElementById('btn-panel-play'),
    status: document.getElementById('audio-status'),
    sourceButtons: [...document.querySelectorAll('[data-source]')],
    fileButton: document.getElementById('btn-source-file'),
    fileInput: document.getElementById('audio-file'),
    bypass: document.getElementById('btn-eq-bypass'),
    limiter: document.getElementById('btn-limiter'),
    volume: document.getElementById('volume'),
    volumeOut: document.getElementById('val-volume')
};

const SOURCE_NAMES = { noise: 'Ruído rosa', file: 'Arquivo', mic: 'Microfone' };

function shortName(name, max = 18) {
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

function updateAudioUI() {
    const playing = audio.playing;

    if (ui.heroLabel) ui.heroLabel.textContent = playing ? 'Pausar Prévia de Áudio' : 'Ouvir Prévia Interativa';
    if (ui.heroIcon) ui.heroIcon.textContent = playing ? '❚❚' : '▶';
    if (ui.panelPlay) ui.panelPlay.textContent = playing ? '❚❚ Pausar' : '▶ Tocar';

    ui.sourceButtons.forEach(button => {
        const active = button.dataset.source === audio.sourceType && !!audio.source;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    if (ui.fileButton) {
        ui.fileButton.textContent = audio.fileName ? `Arquivo: ${shortName(audio.fileName)}` : 'Arquivo…';
    }

    ui.bypass.textContent = audio.eqOn ? 'EQ ligado' : 'EQ desligado';
    ui.bypass.classList.toggle('is-active', audio.eqOn);
    ui.bypass.setAttribute('aria-pressed', String(audio.eqOn));
    ui.limiter.classList.toggle('is-active', audio.limiterOn);
    ui.limiter.setAttribute('aria-pressed', String(audio.limiterOn));

    ui.volumeOut.textContent = `${audio.volume}%`;

    if (!audio.source) {
        ui.status.textContent = 'Parado';
    } else {
        ui.status.textContent = `${SOURCE_NAMES[audio.sourceType]} · ${playing ? 'tocando' : 'pausado'}`;
    }

    syncGraphLoop();
}

/** Aplica EQ/limiter/volume nos nós, com rampa curta para evitar estalos ("zipper noise"). */
function applyAudioParams(immediate = false) {
    if (!audio.nodes) return;
    const { ctx } = audio;
    const { limiter, master } = audio.nodes;
    const t = ctx.currentTime;
    const tau = immediate ? 0.001 : 0.02;
    const values = audio.eqOn ? getValues() : { bass: 0, mid: 0, treble: 0 };

    BAND_KEYS.forEach(key => audio.nodes[key].gain.setTargetAtTime(values[key], t, tau));

    // Limiter "desligado" = threshold 0 dB e ratio 1:1 (não comprime nada)
    limiter.threshold.setTargetAtTime(audio.limiterOn ? -6 : 0, t, tau);
    limiter.ratio.setTargetAtTime(audio.limiterOn ? 20 : 1, t, tau);

    master.gain.setTargetAtTime(Math.pow(audio.volume / 100, 2), t, tau);
}

function ensureAudio() {
    if (audio.ctx) return audio.ctx;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Seu navegador não suporta Web Audio API.');

    const ctx = new AudioContextClass();
    const nodes = { input: ctx.createGain() };

    BAND_KEYS.forEach(key => {
        const def = FILTERS[key];
        const filter = ctx.createBiquadFilter();
        filter.type = def.type;
        filter.frequency.value = def.freq;
        if (def.q !== null) filter.Q.value = def.q;
        nodes[key] = filter;
    });

    nodes.limiter = ctx.createDynamicsCompressor();
    nodes.limiter.knee.value = 0;
    nodes.limiter.attack.value = 0.003;
    nodes.limiter.release.value = 0.1;
    nodes.master = ctx.createGain();
    nodes.analyser = ctx.createAnalyser();
    nodes.analyser.fftSize = 2048;
    nodes.analyser.smoothingTimeConstant = 0.8;

    nodes.input.connect(nodes.bass);
    nodes.bass.connect(nodes.mid);
    nodes.mid.connect(nodes.treble);
    nodes.treble.connect(nodes.limiter);
    nodes.limiter.connect(nodes.master);
    nodes.master.connect(nodes.analyser);
    nodes.analyser.connect(ctx.destination);

    audio.ctx = ctx;
    audio.nodes = nodes;
    audio.freqData = new Float32Array(nodes.analyser.frequencyBinCount);
    applyAudioParams(true);
    return ctx;
}

/** Ruído rosa (algoritmo de Paul Kellet), gerado uma única vez e reaproveitado. */
function getNoiseBuffer(ctx) {
    if (audio.noiseBuffer) return audio.noiseBuffer;

    const size = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < size; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
        b6 = white * 0.115926;
    }
    audio.noiseBuffer = buffer;
    return buffer;
}

function loopingSource(ctx, buffer) {
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    return node;
}

function releaseSource() {
    if (audio.source) {
        try { if (typeof audio.source.stop === 'function') audio.source.stop(); } catch (e) { /* já parado */ }
        try { audio.source.disconnect(); } catch (e) { /* já desconectado */ }
        audio.source = null;
    }
    if (audio.stream) {
        audio.stream.getTracks().forEach(track => track.stop());
        audio.stream = null;
    }
}

/** Troca a fonte de áudio e começa a tocar. */
async function selectSource(type) {
    try {
        const ctx = ensureAudio();
        let nextSource;
        let nextStream = null;

        if (type === 'file') {
            if (!audio.fileBuffer) {
                ui.fileInput.click();   // sem arquivo ainda: abre o seletor
                return;
            }
            nextSource = loopingSource(ctx, audio.fileBuffer);
        } else if (type === 'mic') {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast('Microfone indisponível neste navegador (é preciso HTTPS).');
                return;
            }
            // Desliga processamentos automáticos para que o EQ seja ouvido "limpo"
            nextStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
            });
            nextSource = ctx.createMediaStreamSource(nextStream);
        } else {
            type = 'noise';
            nextSource = loopingSource(ctx, getNoiseBuffer(ctx));
        }

        releaseSource();
        nextSource.connect(audio.nodes.input);
        if (typeof nextSource.start === 'function') nextSource.start();
        audio.source = nextSource;
        audio.stream = nextStream;
        audio.sourceType = type;

        await ctx.resume();
        audio.playing = true;
        updateAudioUI();
        showToast(type === 'mic'
            ? 'Microfone ativo. Use fones de ouvido para evitar microfonia.'
            : `${SOURCE_NAMES[type]} tocando em tempo real.`);
    } catch (error) {
        const denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
        showToast(denied ? 'Permissão do microfone negada.' : (error.message || 'Não foi possível iniciar o áudio.'));
        updateAudioUI();
    }
}

async function togglePlayback() {
    if (!audio.source) {
        await selectSource('noise');   // primeiro play: ruído rosa, sem precisar de arquivo
        return;
    }
    try {
        if (audio.playing) {
            await audio.ctx.suspend();
            audio.playing = false;
            showToast('Áudio pausado.');
        } else {
            await audio.ctx.resume();
            audio.playing = true;
        }
    } catch (error) {
        showToast('Não foi possível alternar o áudio.');
    }
    updateAudioUI();
}

async function loadAudioFile(file) {
    if (!file) return;
    if (file.size > MAX_AUDIO_BYTES) {
        showToast('Arquivo muito grande (máximo 50 MB).');
        return;
    }
    try {
        const ctx = ensureAudio();
        showToast('Carregando áudio…');
        const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
        audio.fileBuffer = decoded;
        audio.fileName = file.name;
        await selectSource('file');
    } catch (error) {
        showToast('Não foi possível ler este arquivo de áudio.');
    }
}

/* ---------- Controles do painel de áudio ---------- */
document.getElementById('btn-audio-preview').addEventListener('click', togglePlayback);
ui.panelPlay.addEventListener('click', togglePlayback);

ui.sourceButtons.forEach(button => {
    button.addEventListener('click', () => {
        const type = button.dataset.source;
        // Se já há arquivo, clicar de novo em "Arquivo" permite trocar por outro
        if (type === 'file' && audio.fileBuffer && audio.sourceType === 'file' && audio.source) {
            ui.fileInput.click();
            return;
        }
        selectSource(type);
    });
});

ui.fileInput.addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';   // permite escolher o mesmo arquivo de novo
    loadAudioFile(file);
});

ui.bypass.addEventListener('click', () => {
    audio.eqOn = !audio.eqOn;
    applyAudioParams();
    updateAudioUI();
    drawGraph();
    showToast(audio.eqOn ? 'EQ ligado.' : 'EQ desligado: ouvindo o som original (A/B).');
});

ui.limiter.addEventListener('click', () => {
    audio.limiterOn = !audio.limiterOn;
    applyAudioParams();
    updateAudioUI();
    showToast(audio.limiterOn ? 'Limiter ligado (protege contra distorção).' : 'Limiter desligado.');
});

ui.volume.addEventListener('input', () => {
    audio.volume = Number(ui.volume.value);
    applyAudioParams();
    ui.volumeOut.textContent = `${audio.volume}%`;
});

/* ==========================================================================
   Atualização central do equalizador
   ========================================================================== */

function updateEqualizer() {
    const values = getValues();
    const matchingPreset = findMatchingPreset(values);

    bands.forEach(({ input, output }) => {
        output.textContent = formatDb(Number(input.value));
        setTrack(input);
    });

    presetButtons.forEach(button => {
        const isActive = button === matchingPreset;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    activeProfile.textContent = matchingPreset?.dataset.name || 'Ajuste personalizado';
    profileStatus.textContent = matchingPreset ? 'PRESET ATIVO' : 'AJUSTE MANUAL';

    applyAudioParams();
    // Durante a reprodução o laço de animação já redesenha; parado, redesenha aqui
    if (!audio.playing) drawGraph();
}

function applyValues(values) {
    bands.forEach(({ key, input }) => {
        input.value = String(values[key]);
    });
    updateEqualizer();
}

/* ==========================================================================
   Slots de memória rápida (localStorage)
   ========================================================================== */

function readSlot(slotNum) {
    const raw = storage.get(slotsKeyPrefix + slotNum);
    if (!raw) return null;
    try {
        const parsed = parsePreset(JSON.parse(raw));
        return { name: (parsed.name || 'Salvo').slice(0, 24), bands: parsed.bands };
    } catch (e) {
        return null;   // dado corrompido: trata como slot vazio
    }
}

function renderSlot(slotNum) {
    const mainButton = document.getElementById(`slot-${slotNum}`);
    const clearButton = document.getElementById(`slot-clear-${slotNum}`);
    const data = readSlot(slotNum);

    mainButton.textContent = data ? `Slot ${slotNum}: ${data.name}` : `Slot ${slotNum} (Vazio)`;
    mainButton.title = data ? 'Clique para carregar este ajuste' : 'Clique para salvar o ajuste atual aqui';
    clearButton.disabled = !data;
}

function saveSlot(slotNum) {
    const values = getValues();
    const name = describeValues(values);
    const ok = storage.set(slotsKeyPrefix + slotNum, JSON.stringify({ name, bands: values }));
    renderSlot(slotNum);
    showToast(ok ? `Ajuste "${name}" salvo no Slot ${slotNum}.` : 'Não foi possível salvar (armazenamento bloqueado).');
}

for (let slotNum = 1; slotNum <= SLOT_COUNT; slotNum++) {
    renderSlot(slotNum);

    document.getElementById(`slot-${slotNum}`).addEventListener('click', () => {
        const data = readSlot(slotNum);
        if (data) {
            applyValues(data.bands);
            showToast(`Slot ${slotNum} ("${data.name}") carregado.`);
        } else {
            saveSlot(slotNum);
        }
    });

    document.getElementById(`slot-save-${slotNum}`).addEventListener('click', () => saveSlot(slotNum));

    document.getElementById(`slot-clear-${slotNum}`).addEventListener('click', () => {
        storage.remove(slotsKeyPrefix + slotNum);
        renderSlot(slotNum);
        showToast(`Slot ${slotNum} limpo.`);
    });
}

/* ==========================================================================
   Importar / exportar / salvar / restaurar
   ========================================================================== */

document.getElementById('btn-upload').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', event => {
    const file = event.target.files[0];
    event.target.value = '';   // sem isso, escolher o mesmo arquivo duas vezes não dispara "change"
    if (!file) return;

    if (file.size > MAX_JSON_BYTES) {
        showToast('Arquivo grande demais para ser um preset.');
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        try {
            const preset = parsePreset(JSON.parse(e.target.result));
            applyValues(preset.bands);
            const label = (preset.name || 'Importado').slice(0, 40);
            showToast(`Preset "${label}" carregado do arquivo!`);
        } catch (err) {
            showToast('Erro ao ler arquivo JSON de preset.');
        }
    };
    reader.onerror = () => showToast('Erro ao ler arquivo JSON de preset.');
    reader.readAsText(file);
});

presetButtons.forEach(button => {
    button.addEventListener('click', () => {
        applyValues({
            bass: Number(button.dataset.bass),
            mid: Number(button.dataset.mid),
            treble: Number(button.dataset.treble)
        });
        showToast(`Perfil "${button.dataset.name}" aplicado.`);
    });
});

bands.forEach(({ input }) => {
    input.addEventListener('input', updateEqualizer);
});

document.getElementById('btn-reset').addEventListener('click', () => {
    applyValues({ bass: 0, mid: 0, treble: 0 });
    showToast('Equalizador restaurado ao padrão.');
});

document.getElementById('btn-save').addEventListener('click', () => {
    const ok = storage.set(storageKey, JSON.stringify({ bands: getValues(), savedAt: new Date().toISOString() }));
    if (ok) {
        profileStatus.textContent = 'AJUSTE SALVO';
        showToast('Ajuste salvo. Ele será restaurado na próxima visita.');
    } else {
        showToast('Não foi possível salvar (armazenamento bloqueado).');
    }
});

document.getElementById('btn-download').addEventListener('click', () => {
    const values = getValues();
    const filtros = {};
    BAND_KEYS.forEach(key => {
        filtros[key] = { tipo: FILTERS[key].type, frequenciaHz: FILTERS[key].freq };
        if (FILTERS[key].q !== null) filtros[key].q = FILTERS[key].q;
    });

    const config = {
        produto: 'Arteria WaveCore',
        versao: 2,
        perfil: findMatchingPreset(values)?.dataset.name || 'Ajuste personalizado',
        equalizacao: {
            gravesDb: values.bass,
            mediosDb: values.mid,
            agudosDb: values.treble
        },
        filtros,
        geradoEm: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);

    downloadLink.href = url;
    downloadLink.download = `arteria-preset-${date}.json`;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Preset baixado em JSON.');
});

/* ==========================================================================
   Inicialização
   ========================================================================== */

(function restoreSavedSettings() {
    const raw = storage.get(storageKey);
    if (!raw) return;
    try {
        const saved = JSON.parse(raw);
        applyValues(sanitizeBands(saved.bands));
    } catch (e) {
        storage.remove(storageKey);   // dado corrompido: descarta
    }
}());

updateEqualizer();
updateAudioUI();
