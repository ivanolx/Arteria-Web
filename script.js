// Capturando os elementos da tela
const bassInput = document.getElementById('bass');
const midInput = document.getElementById('mid');
const trebleInput = document.getElementById('treble');

const valBass = document.getElementById('val-bass');
const valMid = document.getElementById('val-mid');
const valTreble = document.getElementById('val-treble');
const btnSalvar = document.getElementById('btn-salvar');
const presetButtons = document.querySelectorAll('.btn-preset');

// Função para atualizar os valores de texto na tela
function atualizarValores() {
    valBass.textContent = bassInput.value;
    valMid.textContent = midInput.value;
    valTreble.textContent = trebleInput.value;
}

// Listeners dos Sliders manuais
bassInput.addEventListener('input', atualizarValores);
midInput.addEventListener('input', atualizarValores);
trebleInput.addEventListener('input', atualizarValores);

// Lógica dos Botões de Presets Pré-configurados
presetButtons.forEach(button => {
    button.addEventListener('click', () => {
        bassInput.value = button.getAttribute('data-bass');
        midInput.value = button.getAttribute('data-mid');
        trebleInput.value = button.getAttribute('data-treble');
        
        atualizarValores();
    });
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

    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'preset-arteria.json';
    a.click();
    
    alert('Preset gerado e baixado com sucesso! Pronto para carregar no dispositivo.');
});