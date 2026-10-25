// ==UserScript==
// @name            OGame Sons (DRAKO)
// @namespace       drako-ogame-sons
// @version         1.2
// @updateURL       https://raw.githubusercontent.com/DRAKOROCHA/drako-command/main/OGame-Sons.user.js
// @downloadURL     https://raw.githubusercontent.com/DRAKOROCHA/drako-command/main/OGame-Sons.user.js
// @description     Sons suaves de interface para o OGame: cliques, caixas, sucesso/erro. Gerados no browser, sem ficheiros. Funciona com rato e com toque.
// @author          DRAKO
// @match           https://*.ogame.gameforge.com/game/*
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_registerMenuCommand
// @grant           unsafeWindow
// @run-at          document-idle
// ==/UserScript==
'use strict';

(() =>
{
    // ------------------------------------------------------------ definições (guardadas no Tampermonkey)
    const defaults = { enabled:true, volume:0.5, hover:false, showButton:true };
    const settings = Object.assign({}, defaults, GM_getValue('sons', {}));
    const save = () => GM_setValue('sons', settings);

    // ------------------------------------------------------------ motor de som (Web Audio, sem ficheiros)
    let ctx = null;
    let master = null;
    let lastPlay = 0;

    const getContext = () =>
    {
        if(!ctx)
        {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if(!AudioCtx) return null;

            ctx = new AudioCtx();
            master = ctx.createGain();
            master.gain.value = settings.volume;

            // filtro passa-baixo: tira o "agudo" e deixa os sons macios
            const soften = ctx.createBiquadFilter();
            soften.type = 'lowpass';
            soften.frequency.value = 3200;

            master.connect(soften).connect(ctx.destination);
        }

        if(ctx.state === 'suspended') ctx.resume();
        return ctx;
    };

    // um tom curto com ataque e queda suaves
    const tone = (freqStart, freqEnd, duration, level, type = 'sine', delay = 0) =>
    {
        const ac = getContext();
        if(!ac) return;

        const start = ac.currentTime + delay;
        const osc = ac.createOscillator();
        const gain = ac.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, start);
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), start + duration);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        osc.connect(gain).connect(master);
        osc.start(start);
        osc.stop(start + duration + 0.02);
    };

    const sounds =
    {
        click:() => tone(1700, 1100, 0.045, 0.09, 'triangle'),
        nav:() => { tone(900, 700, 0.06, 0.07, 'sine'); tone(1350, 1100, 0.05, 0.04, 'sine', 0.035); },
        toggleOn:() => { tone(900, 900, 0.04, 0.07, 'sine'); tone(1300, 1300, 0.05, 0.06, 'sine', 0.045); },
        toggleOff:() => { tone(1300, 1300, 0.04, 0.06, 'sine'); tone(900, 900, 0.05, 0.07, 'sine', 0.045); },
        hover:() => tone(2600, 2400, 0.018, 0.02, 'sine'),
        success:() => { tone(660, 660, 0.12, 0.07, 'sine'); tone(880, 880, 0.14, 0.06, 'sine', 0.08); tone(1320, 1320, 0.2, 0.05, 'sine', 0.16); },
        error:() => { tone(330, 300, 0.12, 0.08, 'triangle'); tone(260, 240, 0.16, 0.08, 'triangle', 0.1); }
    };

    const play = name =>
    {
        if(!settings.enabled || !sounds[name]) return;

        // no máximo um som a cada 35 ms: nada de rajadas
        const now = performance.now();
        if(now - lastPlay < 35) return;
        lastPlay = now;

        try { sounds[name](); } catch(error) { /* som é extra: nunca partir o jogo */ }
    };

    // ------------------------------------------------------------ cliques
    const navSelector = '.menubutton, #menuTable a, .planetlink, .moonlink, .tabsList a, .ui-tabs-anchor, [data-galaxy]';
    const clickSelector = 'a, button, select, input[type=button], input[type=submit], .ogl_button, .btn_blue, .technology .icon, [onclick], [role=button]';

    // 'click' em vez de 'pointerdown': no tablet/telemóvel só toca num toque real, não ao começar a deslizar a página
    document.addEventListener('click', event =>
    {
        if(event.button !== 0) return;

        const target = event.target;
        if(!(target instanceof Element) || target.closest('.drako_sons, .drako_sonsPanel')) return;

        if(target.matches('input[type=checkbox], input[type=radio]'))
        {
            // no 'click' o estado já mudou
            play(target.checked ? 'toggleOn' : 'toggleOff');
        }
        else if(target.closest(navSelector))
        {
            play('nav');
        }
        else if(target.closest(clickSelector))
        {
            play('click');
        }
    }, { capture:true, passive:true });

    // passar o rato pelos menus (desligado por defeito: é o único que pode cansar)
    let lastHover = null;
    document.addEventListener('pointerover', event =>
    {
        // só com rato: num ecrã tátil o "passar por cima" é o próprio toque
        if(!settings.hover || event.pointerType !== 'mouse' || !(event.target instanceof Element)) return;

        const item = event.target.closest('.menubutton, .planetlink, .moonlink');
        if(item && item !== lastHover)
        {
            lastHover = item;
            play('hover');
        }
        else if(!item)
        {
            lastHover = null;
        }
    }, { passive:true });

    // ------------------------------------------------------------ sucesso / erro (mensagens do próprio jogo)
    const wrapGameFunction = (name, pickSound) =>
    {
        const original = unsafeWindow[name];
        if(typeof original !== 'function' || original.__drakoSons) return false;

        const wrapped = function(...args)
        {
            try { play(pickSound(...args)); } catch(error) {}
            return original.apply(this, args);
        };

        wrapped.__drakoSons = true;
        unsafeWindow[name] = wrapped;
        return true;
    };

    const hookGame = () =>
    {
        // fadeBox(mensagem, falhou) e showNotification(mensagem, tipo) são as caixas de mensagem do jogo
        wrapGameFunction('fadeBox', (message, failed) => failed ? 'error' : 'success');
        wrapGameFunction('showNotification', (message, type) => type === 'error' ? 'error' : 'success');
    };

    hookGame();
    setTimeout(hookGame, 3000); // algumas páginas definem estas funções mais tarde

    // ------------------------------------------------------------ botão flutuante (ligar/desligar)
    const style = document.createElement('style');
    style.textContent = `
        .drako_sons{position:fixed;left:10px;bottom:34px;z-index:9991;width:30px;height:30px;border-radius:50%;
            background:linear-gradient(#2a3442,#161b22);border:1px solid #0b0e12;box-shadow:0 0 10px rgba(0,0,0,.7);
            color:#9dbddd;font-size:15px;line-height:30px;text-align:center;cursor:pointer;user-select:none;opacity:.55;transition:opacity .2s}
        .drako_sons:hover{opacity:1}
        .drako_sons.drako_off{color:#5b6672}
        @media (pointer:coarse){ .drako_sons{width:40px;height:40px;line-height:40px;font-size:19px;opacity:.75} }
        .drako_sonsPanel{position:fixed;left:10px;bottom:80px;z-index:9992;background:#161b22;border:1px solid #2a3442;border-radius:8px;
            box-shadow:0 0 15px rgba(0,0,0,.8);padding:12px;color:#b7c1c9;font:12px Verdana,Arial,sans-serif;width:220px;box-sizing:border-box}
        .drako_sonsPanel label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0;min-height:28px}
        .drako_sonsPanel input[type=range]{width:120px;height:28px}
        .drako_sonsPanel input[type=checkbox]{width:20px;height:20px}
        .drako_sonsPanel .drako_close{display:block;width:100%;margin-top:6px;padding:8px;background:#2a3442;color:#fff;border:0;border-radius:5px;font-size:12px}
    `;
    document.head.appendChild(style);

    const button = document.createElement('div');
    button.className = 'drako_sons';

    const refreshButton = () =>
    {
        button.textContent = settings.enabled ? '🔊' : '🔇';
        button.classList.toggle('drako_off', !settings.enabled);
        button.title = `Sons ${settings.enabled ? 'ligados' : 'desligados'} (volume ${Math.round(settings.volume * 100)}%)\nToque/clique: ligar/desligar · Toque longo: volume e opções · Roda do rato: volume`;
        button.style.display = settings.showButton ? '' : 'none';
    };

    // toque/clique curto: ligar/desligar · toque longo (meio segundo): painel com volume e opções
    let pressTimer = null;
    let longPress = false;

    button.addEventListener('pointerdown', () =>
    {
        longPress = false;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => { longPress = true; openPanel(); }, 500);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach(name => button.addEventListener(name, () => clearTimeout(pressTimer)));
    button.addEventListener('contextmenu', event => event.preventDefault()); // o toque longo não abre o menu do browser

    button.addEventListener('click', () =>
    {
        if(longPress) return;

        settings.enabled = !settings.enabled;
        save();
        refreshButton();
        if(settings.enabled) play('toggleOn');
    });

    const openPanel = () =>
    {
        document.querySelector('.drako_sonsPanel')?.remove();

        const panel = document.createElement('div');
        panel.className = 'drako_sonsPanel';
        panel.innerHTML = `
            <b>Sons</b>
            <label>Ligados <input type="checkbox" data-key="enabled"></label>
            <label>Volume <input type="range" min="5" max="100" step="5"></label>
            <label>Ao passar o rato <input type="checkbox" data-key="hover"></label>
            <button class="drako_close">Fechar</button>
        `;

        panel.querySelectorAll('input[type=checkbox]').forEach(input =>
        {
            input.checked = !!settings[input.dataset.key];
            input.addEventListener('change', () => { settings[input.dataset.key] = input.checked; save(); refreshButton(); });
        });

        const range = panel.querySelector('input[type=range]');
        range.value = Math.round(settings.volume * 100);
        range.addEventListener('input', () => setVolume(range.value / 100));

        panel.querySelector('.drako_close').addEventListener('click', () => panel.remove());
        document.body.appendChild(panel);
    };

    button.addEventListener('wheel', event =>
    {
        event.preventDefault();
        setVolume(settings.volume + (event.deltaY < 0 ? 0.1 : -0.1));
    }, { passive:false });

    document.body.appendChild(button);

    const setVolume = value =>
    {
        settings.volume = Math.min(1, Math.max(0.05, Math.round(value * 100) / 100));
        if(master) master.gain.value = settings.volume;
        save();
        refreshButton();

        // ao arrastar a barra de volume, um som de amostra no máximo a cada 150 ms
        const now = performance.now();
        if(now - (setVolume.lastSample || 0) > 150) { setVolume.lastSample = now; play('click'); }
    };

    refreshButton();

    // ------------------------------------------------------------ menu do Tampermonkey
    if(typeof GM_registerMenuCommand === 'function')
    {
        GM_registerMenuCommand('Sons: ligar / desligar', () => button.click());
        GM_registerMenuCommand('Sons: volume +', () => setVolume(settings.volume + 0.1));
        GM_registerMenuCommand('Sons: volume -', () => setVolume(settings.volume - 0.1));
        GM_registerMenuCommand('Sons: som ao passar o rato nos menus (ligar/desligar)', () => { settings.hover = !settings.hover; save(); });
        GM_registerMenuCommand('Sons: mostrar / esconder o botão', () => { settings.showButton = !settings.showButton; save(); refreshButton(); });
    }
})();
