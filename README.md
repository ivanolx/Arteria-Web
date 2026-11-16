# 🎛️ Arteria - Web Companion & Control Hub

Repositório oficial do sistema web de suporte, gerenciamento de presets e central de downloads do **Arteria**, desenvolvido como parte do Projeto de Extensão **ENGETEC 2026.2** da UniSapiens em parceria com a *WaveCore Audio Studio*.

---

## 👥 Equipe de Desenvolvimento
* **Lucas Dukler** — Engenharia da Computação *(Hardware / Protótipo de Placa de Áudio)*
* **Ivano de Lima Xavier** — Sistemas de Informação *(Software Web / Painel de Controle Responsivo)*

---

## 🚀 Sobre o Projeto
O **Arteria** consiste em um protótipo de placa de áudio ultracompacto com equalização ativa de 3 bandas (graves, médios e agudos) via conexão USB-C (IN/OUT) para dispositivos móveis. 

Enquanto a parte de hardware gerencia o fluxo analógico e digital do som, este **Web Companion** apresenta uma demonstração interativa para configurar e compartilhar perfis de áudio:
* **Interface Purple Cyberpunk:** Design renovado em tons roxos neon com alta fidelidade visual.
* **Equalizador de 3 bandas:** Ajustes em tempo real para graves, médios e agudos, com indicação de valores em dB.
* **Visualizador Gráfico de Frequências:** Curva de equalização calculada em tempo real via Canvas.
* **Prévia Interativa de Som (Web Audio API):** Teste os filtros de áudio em tempo real com gerador de áudio no navegador.
* **Sistema de Slots & Arquivos:** Salve configurações em slots rápidos do navegador ou exporte/importe arquivos `.json` de presets.

> A interface simula o processamento do hardware Arteria e fornece prévia sonora via software.

---

## 🛠️ Tecnologias Utilizadas
* **HTML5, CSS3 (Custom Properties & Purple Dark Palette) & JavaScript (Web Audio API & Canvas)**
* **Design Responsivo** (Foco em experiência mobile via USB-C)
* **Git & GitHub** (Controle de versão e versionamento do projeto)

---

## 🔮 Próximas Evoluções Planejadas (Roadmap)
1. **Integração WebUSB / Web Bluetooth API:** Permitir atualização de dados direto no protótipo físico via navegador.
2. **Controle de Efeitos Adicionais:** Suporte para filtros de Reverb, Ganho de Entrada e Limiter.
3. **Comunidade de Presets:** Compartilhamento de presets criados por usuários em nuvem.

---
*Projeto acadêmico desenvolvido para o Centro Universitário UniSAPIENS.*