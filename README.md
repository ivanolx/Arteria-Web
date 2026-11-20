# 🎛️ Arteria - Web Companion & Control Hub

Repositório oficial do sistema web de suporte, gerenciamento de presets e central de downloads do **Arteria**, desenvolvido como parte do Projeto de Extensão **ENGETEC 2026.2** da UniSapiens em parceria com a *WaveCore Audio Studio*.

---

## 👥 Equipe de Desenvolvimento
* **Lucas Dukler** — Engenharia da Computação *(Hardware / Protótipo de Placa de Áudio)*
* **Ivano de Lima Xavier** — Sistemas de Informação *(Software Web / Painel de Controle Responsivo)*

---

## 🚀 Sobre o Projeto
O **Arteria** consiste em um protótipo de placa de áudio ultracompacto com equalização ativa de 3 bandas (graves, médios e agudos) via conexão USB-C (IN/OUT) para dispositivos móveis.

Enquanto a parte de hardware gerencia o fluxo analógico e digital do som, este **Web Companion** apresenta uma demonstração interativa para configurar e compartilhar perfis de áudio.

### 💡 O conceito
> *"Um ajuste muda tudo."* — O áudio de celular costuma ser tratado só pelo app de música ou pelo fone. O Arteria move a equalização para **uma peça independente, no meio do caminho**: o som sai do celular pela USB-C, passa pela placa (que aplica o EQ ativo) e segue para o fone ou caixa. Assim o ajuste vale para **qualquer app** — música, vídeo, chamada, jogo.

O Web Companion é o "painel de controle" dessa placa: o usuário escolhe um perfil, ajusta os três controles, ouve o resultado e guarda ou compartilha o preset. Hoje o processamento é **simulado no navegador** (Web Audio API); o objetivo é que os mesmos parâmetros sejam enviados à placa real.

### ✨ Recursos
* **Interface Purple Cyberpunk:** design em tons roxos neon, responsivo, com foco em mobile.
* **Equalizador de 3 bandas:** ±12 dB para graves, médios e agudos, com valores em dB.
* **Curva de resposta real:** o gráfico (eixo logarítmico, 20 Hz – 20 kHz) é calculado com as mesmas equações dos filtros que processam o áudio, não é um desenho aproximado.
* **Analisador de espectro ao vivo:** mostra o áudio *pós-EQ* atrás da curva enquanto toca.
* **Prévia de áudio com 3 fontes:** ruído rosa gerado, **arquivo de áudio local** (até 50 MB, em loop) ou **microfone**.
* **Comparação A/B:** botão "EQ ligado / desligado" para ouvir a diferença na hora.
* **Limiter e volume:** protegem contra distorção e contra volume alto ao somar ganhos.
* **Presets, slots e arquivos:** presets prontos, 3 slots de memória rápida (salvar, sobrescrever, limpar), "Salvar ajuste" que é restaurado na próxima visita, e exportar/importar `.json`.

> A interface simula o processamento do hardware Arteria e fornece prévia sonora via software.

---

## 🔊 Como o áudio funciona

```
 fonte ──► entrada ──► GRAVES ──► MÉDIOS ──► AGUDOS ──► limiter ──► volume ──► analisador ──► saída
(ruído / arquivo / mic)  lowshelf   peaking    highshelf
```

| Banda  | Filtro      | Frequência | Q   | Faixa     |
|--------|-------------|------------|-----|-----------|
| Graves | `lowshelf`  | 250 Hz     | —   | ±12 dB    |
| Médios | `peaking`   | 1 kHz      | 0,8 | ±12 dB    |
| Agudos | `highshelf` | 4 kHz      | —   | ±12 dB    |

Os valores ficam em um único lugar (`FILTERS` em `eq-math.js`). Alterar a frequência ali muda o áudio, o gráfico e o JSON exportado de uma vez. As mudanças de ganho usam rampas curtas (`setTargetAtTime`) para não gerar estalos ao arrastar os sliders.

---

## 📁 Estrutura do projeto

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura da página |
| `style.css` | Tema e responsividade |
| `eq-math.js` | Matemática pura do EQ (filtros, curva, validação de presets). Sem DOM, por isso é testável em Node |
| `script.js` | Interface, motor de áudio, slots, importação e exportação |
| `tests/eq-math.test.js` | Testes automatizados da matemática do EQ |

Para testar: `node tests/eq-math.test.js`. Para rodar o site localmente, sirva a pasta por HTTP (por exemplo `npx http-server`). O microfone só funciona em `localhost` ou `https`.

---

## 📄 Formato do preset (`.json`)

```json
{
  "produto": "Arteria WaveCore",
  "versao": 2,
  "perfil": "Graves em destaque",
  "equalizacao": { "gravesDb": 6, "mediosDb": -2, "agudosDb": 4 },
  "filtros": {
    "bass":   { "tipo": "lowshelf",  "frequenciaHz": 250 },
    "mid":    { "tipo": "peaking",   "frequenciaHz": 1000, "q": 0.8 },
    "treble": { "tipo": "highshelf", "frequenciaHz": 4000 }
  },
  "geradoEm": "2026-11-19T20:00:00.000Z"
}
```

* A importação aceita a `versao` 1 (só `equalizacao`) e a 2. O campo `filtros` é informativo e ajuda o firmware a conferir a configuração.
* Valores fora de ±12 dB são limitados, decimais são arredondados, valores ausentes viram 0 e valores inválidos (texto, `NaN`) rejeitam o arquivo.

---

## 🔌 Ideia de protocolo com a placa (rascunho)

Quando a ponte com o hardware existir (WebUSB ou Web Serial), a mensagem mais simples seria um JSON por linha:

```json
{"cmd":"set_eq","bass":6,"mid":-2,"treble":4}
{"cmd":"get_state"}
{"cmd":"save_slot","slot":1}
```

A placa responderia com `{"ok":true,"fw":"1.0.4","eq":{"bass":6,"mid":-2,"treble":4}}`. Pontos a combinar com a equipe de hardware: resolução do ganho (passos de 1 dB ou 0,5 dB), onde os slots ficam guardados (memória da placa ou do app) e como o app detecta que a placa foi conectada.

---

## 🛠️ Tecnologias Utilizadas
* **HTML5, CSS3 (Custom Properties & Purple Dark Palette) & JavaScript (Web Audio API & Canvas)**
* **Design Responsivo** (foco em experiência mobile via USB-C)
* **Git & GitHub** (controle de versão)

---

## 🔮 Roadmap e Ideias

**Planejado**
1. **Integração WebUSB / Web Serial / Web Bluetooth:** enviar o preset direto ao protótipo físico pelo navegador.
2. **Efeitos adicionais:** reverb e ganho de entrada (o limiter já está implementado).
3. **Comunidade de presets:** compartilhamento de presets criados por usuários, em nuvem.

**Ideias em estudo**
* **Presets por dispositivo:** perfis ajustados a modelos de fone ou caixa (por exemplo, "compensar fone com grave fraco").
* **Auto-EQ por medição:** tocar um sweep, captar com o microfone e sugerir os ganhos de cada banda.
* **Modo noite / volume baixo:** realce automático de graves e agudos em volume baixo (curva de loudness).
* **Presets por situação:** podcast, chamada de voz, academia, jogos (passos e voz), com alternância automática conforme o app.
* **Mais bandas:** versão "avançada" com 5 bandas ou EQ paramétrico (frequência e Q ajustáveis).
* **Compartilhar por link ou QR code:** o preset codificado na URL, sem precisar de servidor.
* **Instalável como PWA:** funcionar offline e abrir como app no celular.
* **Medidores de nível (VU) e detector de clipping** na prévia.
* **Acessibilidade:** perfis que realçam a clareza da fala para quem tem perda auditiva leve.

---
*Projeto acadêmico desenvolvido para o Centro Universitário UniSAPIENS.*
