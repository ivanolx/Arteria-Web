// Capturando os elementos da tela
const bassInput = document.getElementById('bass');
const midInput = document.getElementById('mid');
const trebleInput = document.getElementById('treble');

const valBass = document.getElementById('val-bass');
const valMid = document.getElementById('val-mid');
const valTreble = document.getElementById('val-treble');
const btnSalvar = document.getElementById('btn-salvar');

// Atualizar valores na tela quando mexer nos sliders
bassInput.addEventListener('input', (e) => {
    valBass.textContent = e.target.value;
});

midInput.addEventListener('input', (e) => {
    valMid.textContent = e.target.value;
});

trebleInput.addEventListener('input', (e) => {
    valTreble.textContent = e.target.value;
});

// Simular o download do arquivo de configuração/preset
btnSalvar.addEventListener('click', () => {
    const configData = {
        dispositivo: "Arteria WaveCore",
        equalizacao: {
            graves: bassInput.value + "dB",
            medios: midInput.value + "dB",
            agudos: trebleInput.value + "dB"
        },
        data: new Date().toISOString()
    };

    // Criando um arquivo JSON virtual para download
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'preset-arteria.json';
    a.click();
    
    alert('Preset gerado e baixado com sucesso! Pronto para carregar no dispositivo.');
});