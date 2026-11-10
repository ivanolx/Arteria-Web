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
let toastTimeout;

function getValues() {
    return Object.fromEntries(bands.map(({ key, input }) => [key, Number(input.value)]));
}

function valuesMatch(first, second) {
    return bands.every(({ key }) => first[key] === second[key]);
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
        ? `linear-gradient(to right, #35413c 0%, #35413c ${position}%, #c1fa72 ${position}%, #c1fa72 ${zero}%, #35413c ${zero}%, #35413c 100%)`
        : `linear-gradient(to right, #35413c 0%, #35413c ${zero}%, #c1fa72 ${zero}%, #c1fa72 ${position}%, #35413c ${position}%, #35413c 100%)`;

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
}

function applyValues(values) {
    bands.forEach(({ key, input }) => {
        input.value = String(values[key]);
    });
    updateEqualizer();
}

function isValidValues(values) {
    return values && bands.every(({ key, input }) =>
        Number.isInteger(values[key]) &&
        values[key] >= Number(input.min) &&
        values[key] <= Number(input.max)
    );
}

function restoreSavedValues() {
    let saved;

    try {
        const storedValue = window.localStorage.getItem(storageKey);
        if (!storedValue) return;
        saved = JSON.parse(storedValue);
        if (!isValidValues(saved?.bands)) {
            throw new Error('Os ajustes armazenados não possuem valores válidos.');
        }
    } catch (error) {
        console.error('Não foi possível restaurar os ajustes salvos do Arteria.', error);
        showToast('Não foi possível restaurar os ajustes salvos.');
        return;
    }

    applyValues(saved.bands);
    profileStatus.textContent = 'AJUSTE SALVO';
    showToast('Seus últimos ajustes foram restaurados.');
}

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
    } catch (error) {
        console.error('Não foi possível salvar os ajustes do Arteria.', error);
        showToast('Não foi possível salvar. Verifique as permissões do navegador.');
        return;
    }

    profileStatus.textContent = 'AJUSTE SALVO';
    showToast('Ajustes salvos neste navegador.');
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
    showToast('Preset baixado. Pronto para compartilhar.');
});

updateEqualizer();
restoreSavedValues();
