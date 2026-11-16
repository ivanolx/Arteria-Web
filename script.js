const bands = [
    { key: 'bass', input: document.getElementById('bass'), output: document.getElementById('val-bass') },
    { key: 'mid', input: document.getElementById('mid'), output: document.getElementById('val-mid') },
    { key: 'treble', input: document.getElementById('treble'), output: document.getElementById('val-treble') }
];

const presetButtons = [...document.querySelectorAll('.preset-button')];
const activeProfile = document.getElementById('active-profile');
const profileStatus = document.getElementById('profile-status');
const toast = document.getElementById('toast');
const storageKey = 'arteria-equalizer-settings';
const slotsKeyPrefix = 'arteria-slot-';
let toastTimeout;

// Web Audio API Synth Engine
let audioCtx = null;
let noiseNode = null;
let bassFilter = null;
let midFilter = null;
let trebleFilter = null;
let masterGain = null;
let isAudioPlaying = false;

function getValues() {
    return Object.fromEntries(bands.map(({ key, input }) => [key, Number(input.value)]));
}

function formatDb(value) {
    if (value > 0) return `+${value} dB`;
    if (value < 0) return `−${Math.abs(value)} dB`;
    return '0 dB';
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

function drawSpectrum(values) {
    const canvas = document.getElementById('spectrum-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#2d2245';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    ctx.beginPath();
    const bassY = centerY - (values.bass * 2.5);
    const midY = centerY - (values.mid * 2.5);
    const trebleY = centerY - (values.treble * 2.5);

    ctx.moveTo(0, bassY);
    ctx.bezierCurveTo(width * 0.25, bassY, width * 0.35, midY, width * 0.5, midY);
    ctx.bezierCurveTo(width * 0.65, midY, width * 0.75, trebleY, width, trebleY);

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#06b6d4');
    gradient.addColorStop(0.5, '#a855f7');
    gradient.addColorStop(1, '#c084fc');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function updateAudioEngine(values) {
    if (!isAudioPlaying || !bassFilter) return;
    bassFilter.gain.setValueAtTime(values.bass, audioCtx.currentTime);
    midFilter.gain.setValueAtTime(values.mid, audioCtx.currentTime);
    trebleFilter.gain.setValueAtTime(values.treble, audioCtx.currentTime);
}

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

    drawSpectrum(values);
    updateAudioEngine(values);
}

function applyValues(values) {
    bands.forEach(({ key, input }) => {
        input.value = String(values[key]);
    });
    updateEqualizer();
}

// Audio Synthetic Preview Node Setup
function toggleAudioPreview() {
    const previewBtnText = document.getElementById('preview-text');

    if (isAudioPlaying) {
        if (audioCtx) audioCtx.suspend();
        isAudioPlaying = false;
        previewBtnText.textContent = 'Ouvir Prévia Interativa';
        showToast('Áudio suspenso.');
        return;
    }

    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        const bufferSize = audioCtx.sampleRate * 2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            data[i] *= 0.05;
            b6 = white * 0.115926;
        }

        noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = buffer;
        noiseNode.loop = true;

        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 250;

        midFilter = audioCtx.createBiquadFilter();
        midFilter.type = 'peaking';
        midFilter.frequency.value = 1000;
        midFilter.Q.value = 0.8;

        trebleFilter = audioCtx.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 4000;

        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.3;

        noiseNode.connect(bassFilter);
        bassFilter.connect(midFilter);
        midFilter.connect(trebleFilter);
        trebleFilter.connect(masterGain);
        masterGain.connect(audioCtx.destination);

        noiseNode.start();
    } else {
        audioCtx.resume();
    }

    isAudioPlaying = true;
    previewBtnText.textContent = 'Pausar Prévia de Áudio';
    updateAudioEngine(getValues());
    showToast('Reproduzindo áudio sintetizado em tempo real.');
}

document.getElementById('btn-audio-preview').addEventListener('click', toggleAudioPreview);

// Slot Management
[1, 2, 3].forEach(slotNum => {
    const btn = document.getElementById(`slot-${slotNum}`);
    const savedSlot = localStorage.getItem(slotsKeyPrefix + slotNum);
    if (savedSlot) {
        try {
            const data = JSON.parse(savedSlot);
            btn.textContent = `Slot ${slotNum}: ${data.name || 'Salvo'}`;
        } catch (e) {}
    }

    btn.addEventListener('click', () => {
        const currentData = localStorage.getItem(slotsKeyPrefix + slotNum);
        if (currentData) {
            const parsed = JSON.parse(currentData);
            applyValues(parsed.bands);
            showToast(`Slot ${slotNum} ("${parsed.name}") carregado.`);
        } else {
            const values = getValues();
            const slotName = prompt(`Digite o nome para o Slot ${slotNum}:`, `Ajuste ${slotNum}`) || `Ajuste ${slotNum}`;
            const payload = { name: slotName, bands: values };
            localStorage.setItem(slotsKeyPrefix + slotNum, JSON.stringify(payload));
            btn.textContent = `Slot ${slotNum}: ${slotName}`;
            showToast(`Ajuste salvo no Slot ${slotNum}.`);
        }
    });
});

// JSON File Upload Handler
document.getElementById('btn-upload').addEventListener('click', () => {
    document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            if (json.equalizacao) {
                applyValues({
                    bass: json.equalizacao.gravesDb ?? 0,
                    mid: json.equalizacao.mediosDb ?? 0,
                    treble: json.equalizacao.agudosDb ?? 0
                });
                showToast(`Preset "${json.perfil || 'Importado'}" carregado do arquivo!`);
            } else if (json.bands) {
                applyValues(json.bands);
                showToast('Preset importado com sucesso!');
            } else {
                throw new Error('Formato inválido.');
            }
        } catch (err) {
            showToast('Erro ao ler arquivo JSON de preset.');
        }
    };
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
    const settings = {
        bands: getValues(),
        savedAt: new Date().toISOString()
    };
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(settings));
        profileStatus.textContent = 'AJUSTE SALVO';
        showToast('Ajustes salvos no navegador.');
    } catch (error) {
        showToast('Não foi possível salvar.');
    }
});

document.getElementById('btn-download').addEventListener('click', () => {
    const values = getValues();
    const config = {
        produto: 'Arteria WaveCore',
        versao: 1,
        perfil: findMatchingPreset(values)?.dataset.name || 'Ajuste personalizado',
        equalizacao: {
            gravesDb: values.bass,
            mediosDb: values.mid,
            agudosDb: values.treble
        },
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

updateEqualizer();