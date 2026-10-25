// ==UserScript==
// @name            OGame Toque (DRAKO)
// @namespace       drako-ogame-toque
// @version         1.7
// @updateURL       https://raw.githubusercontent.com/DRAKOROCHA/drako-command/main/OGame-Toque.user.js
// @downloadURL     https://raw.githubusercontent.com/DRAKOROCHA/drako-command/main/OGame-Toque.user.js
// @description     Para tablet e telemóvel: deteta telemóvel/tablet e vertical/deitado, ajusta a página ao ecrã e aumenta as teclas de atalho do DRAKO Command, os botões, o menu e a lista de planetas. Cada dispositivo guarda os seus tamanhos.
// @author          DRAKO
// @match           https://*.ogame.gameforge.com/game/*
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_addStyle
// @grant           GM_registerMenuCommand
// @run-at          document-start
// ==/UserScript==
'use strict';

(() =>
{
    // ------------------------------------------------------------ definições (deste dispositivo)
    const defaults =
    {
        auto:true,           // escolher os tamanhos sozinho conforme o ecrã
        fitWidth:true,       // ajustar a página à largura do ecrã
        fitContent:true,     // medir a largura real do jogo (menu + centro + planetas) e enquadrar
        hideAds:true,        // esconder a publicidade lateral, que rouba largura
        measuredWidth:0,     // última largura medida do jogo (px CSS)
        pageWidth:1060,      // largura "virtual" da página em px (menor = tudo maior)
        shortcutScale:1.6,   // teclas de atalho do DRAKO Command
        shortcutPos:'bottom',// bottom | right | left
        buttonScale:1.3,     // botões do DRAKO Command e do jogo
        menuScale:1.2,       // menu da esquerda
        planetScale:1.2,     // lista de planetas
        buttonSide:'right'   // lado do botão do painel
    };

    const settings = Object.assign({}, defaults, GM_getValue('toque', {}));
    const save = () => GM_setValue('toque', settings);

    // ------------------------------------------------------------ deteção do ecrã
    // screen.width/height no Android já vêm em px CSS (S23 Ultra ≈ 384×824, tablets ≥ 600 no lado menor)
    const detect = () =>
    {
        const w = window.screen?.width || window.innerWidth;
        const h = window.screen?.height || window.innerHeight;
        const shortSide = Math.min(w, h);
        const landscape = window.matchMedia ? window.matchMedia('(orientation: landscape)').matches : w > h;
        const type = shortSide < 600 ? 'phone' : 'tablet';
        return { type, landscape, label:`${type == 'phone' ? 'telemóvel' : 'tablet'}, ${landscape ? 'deitado' : 'vertical'}` };
    };

    const profiles =
    {
        'phone-portrait':   { pageWidth:1000, shortcutScale:1.7, shortcutPos:'bottom', buttonScale:1.6, menuScale:1.5, planetScale:1.5 },
        'phone-landscape':  { pageWidth:1000, shortcutScale:1.8, shortcutPos:'right',  buttonScale:1.4, menuScale:1.3, planetScale:1.3 },
        'tablet-portrait':  { pageWidth:1060, shortcutScale:1.7, shortcutPos:'bottom', buttonScale:1.3, menuScale:1.2, planetScale:1.2 },
        'tablet-landscape': { pageWidth:1120, shortcutScale:1.5, shortcutPos:'right',  buttonScale:1.2, menuScale:1.1, planetScale:1.1 }
    };

    // valores em uso: o perfil automático do ecrã atual, ou os escolhidos à mão
    const current = () =>
    {
        const d = detect();
        const cfg = settings.auto ? Object.assign({}, settings, profiles[`${d.type}-${d.landscape ? 'landscape' : 'portrait'}`]) : Object.assign({}, settings);
        if(settings.fitContent && settings.measuredWidth > 600) cfg.pageWidth = settings.measuredWidth + 16; // margem de 8 px de cada lado
        return cfg;
    };

    // ------------------------------------------------------------ ajustar a página ao ecrã (viewport)
    const applyViewport = () =>
    {
        const apply = () =>
        {
            let meta = document.querySelector('meta[name="viewport"]');

            const cfg = current();

            if(!cfg.fitWidth)
            {
                if(meta?.dataset.drako) meta.remove();
                return;
            }

            if(!meta)
            {
                meta = document.createElement('meta');
                meta.name = 'viewport';
                (document.head || document.documentElement).appendChild(meta);
            }

            meta.dataset.drako = '1';
            // largura fixa: a página cabe na largura do ecrã e continua a dar para fazer zoom com os dedos
            meta.content = `width=${Math.round(cfg.pageWidth)}, user-scalable=yes, minimum-scale=0.1, maximum-scale=5`;
        };

        if(document.head) apply();
        else new MutationObserver((mutations, observer) => { if(document.head) { observer.disconnect(); apply(); } }).observe(document.documentElement || document, { childList:true, subtree:true });
    };

    // ------------------------------------------------------------ publicidade lateral
    const hideAds = () =>
    {
        if(!settings.hideAds || !document.body) return;

        const right = document.querySelector('#rechts, #planetList');
        const limit = right ? right.getBoundingClientRect().right - 2 : window.innerWidth * 0.8;

        // blocos altos e estreitos à direita da lista de planetas com imagem/iframe = banner
        document.querySelectorAll('body > div, body > a, body > div > div, #pageContent > div, #pageContent > a, #pageReloader > div, iframe').forEach(el =>
        {
            if(el.closest('[class*="ogl_"], [class*="drk_"], #rechts, #planetList, #middle, #links')) return;

            const r = el.getBoundingClientRect();
            const looksLikeBanner = r.left >= limit && r.width >= 100 && r.width <= 420 && r.height >= 250 && (el.matches('iframe, img') || el.querySelector('img, iframe, video'));
            if(looksLikeBanner) { el.style.setProperty('display', 'none', 'important'); el.dataset.drkHidden = 'ad'; }
        });

        // ids conhecidos dos banners laterais do OGame
        document.querySelectorAll('#banner_skyscraper, .banner_skyscraper, #promotionCountdownBox, [id^="banner_skyscraper"]').forEach(el =>
        {
            el.style.setProperty('display', 'none', 'important');
            el.dataset.drkHidden = 'ad';
        });
    };

    // ------------------------------------------------------------ medir o jogo e enquadrar
    const measure = () =>
    {
        if(!settings.fitContent || !document.body) return;

        hideAds();

        const parts = [...document.querySelectorAll('#links, #menuTable, #middle, #rechts, #planetList, .ogl_topbar, #countColonies')]
            .map(el => el.getBoundingClientRect())
            .filter(r => r.width > 0 && r.height > 0);
        if(parts.length < 2) return;

        const left = Math.min(...parts.map(r => r.left)) + window.scrollX;
        const right = Math.max(...parts.map(r => r.right)) + window.scrollX;
        const width = Math.ceil(right - left);
        if(width < 600 || width > 2000) return;

        if(Math.abs(width - (settings.measuredWidth || 0)) > 8)
        {
            settings.measuredWidth = width;
            save();
            applyViewport();
        }

        // encostar o jogo à esquerda do ecrã (o menu deixa de ficar cortado)
        setTimeout(() =>
        {
            const menu = document.querySelector('#links, #menuTable');
            if(!menu) return;
            const x = menu.getBoundingClientRect().left + window.scrollX - 8;
            if(Math.abs(window.scrollX - x) > 4) window.scrollTo(Math.max(0, x), window.scrollY);
        }, 400);
    };

    // ------------------------------------------------------------ estilos (variáveis CSS, mudam ao vivo)
    const setVars = () =>
    {
        const root = document.documentElement;
        if(!root) return;

        const cfg = current();
        root.style.setProperty('--drk-sc', cfg.shortcutScale);
        root.style.setProperty('--drk-btn', cfg.buttonScale);
        root.style.setProperty('--drk-menu', cfg.menuScale);
        root.style.setProperty('--drk-planet', cfg.planetScale);
        root.dataset.drkShortcuts = cfg.shortcutPos;
    };

    GM_addStyle(`
        /* ---------- teclas de atalho do DRAKO Command ---------- */
        .ogl_shortcuts{gap:calc(7px * var(--drk-sc, 1)) !important}
        .ogl_shortcuts [data-key]{
            width:calc(40px * var(--drk-sc, 1)) !important;
            min-width:calc(40px * var(--drk-sc, 1)) !important;
            line-height:calc(26px * var(--drk-sc, 1)) !important;
            height:calc(26px * var(--drk-sc, 1)) !important;
            font-size:calc(11px * var(--drk-sc, 1)) !important;
            border-radius:calc(4px * var(--drk-sc, 1)) !important;
            touch-action:manipulation;
        }
        .ogl_shortcuts [data-key-id]:after,
        .ogl_shortcuts [data-key] .material-icons{font-size:calc(16px * var(--drk-sc, 1)) !important}

        /* barra à direita / à esquerda em coluna */
        html[data-drk-shortcuts=right] .ogl_shortCutWrapper,
        html[data-drk-shortcuts=left] .ogl_shortCutWrapper{flex-direction:row !important;align-items:center !important}
        html[data-drk-shortcuts=right] .ogl_shortCutWrapper>div:first-child{flex:1}
        html[data-drk-shortcuts=left] .ogl_shortCutWrapper>div:first-child{order:2;flex:1}
        html[data-drk-shortcuts=right] .ogl_shortcuts,
        html[data-drk-shortcuts=left] .ogl_shortcuts{
            flex-direction:column !important;flex-wrap:wrap !important;max-height:92% !important;width:auto !important;
            margin:0 calc(6px * var(--drk-sc, 1)) !important;transform:none !important;align-content:center}

        /* ---------- botões (DRAKO Command e jogo) ---------- */
        .ogl_button, .ogl_tab, .btn_blue, .ogl_inputField, #fleet1 .ogl_fleetBtn{
            min-height:calc(22px * var(--drk-btn, 1)) !important;
            line-height:calc(22px * var(--drk-btn, 1)) !important;
            font-size:calc(11px * var(--drk-btn, 1)) !important;
            touch-action:manipulation;
        }
        .ogl_tab{padding:0 calc(8px * var(--drk-btn, 1)) !important}
        input[type=checkbox], input[type=radio]{transform:scale(var(--drk-btn, 1));margin:calc(3px * var(--drk-btn, 1)) !important}

        /* ---------- menu da esquerda ---------- */
        #menuTable .menubutton .textlabel{font-size:calc(11px * var(--drk-menu, 1)) !important}
        #menuTable li{margin-bottom:calc(2px * var(--drk-menu, 1)) !important}

        /* ---------- lista de planetas ---------- */
        #planetList .smallplanet{min-height:calc(48px * var(--drk-planet, 1)) !important}
        #planetList .planetlink, #planetList .moonlink{touch-action:manipulation}
        #planetList .planet-name, #planetList .planet-koords{font-size:calc(11px * var(--drk-planet, 1)) !important}
        #planetList .planetPic{transform:scale(var(--drk-planet, 1));transform-origin:center}

        /* ---------- painel deste script ---------- */
        .drk_toqueBtn{position:fixed;bottom:34px;z-index:99990;width:44px;height:44px;border-radius:50%;
            background:linear-gradient(#2a3442,#161b22);border:1px solid #0b0e12;box-shadow:0 0 10px rgba(0,0,0,.8);
            color:#9dbddd;font:22px/44px Arial,sans-serif;text-align:center;cursor:pointer;user-select:none;opacity:.8;touch-action:manipulation}
        .drk_toqueBtn[data-side=right]{right:10px}
        .drk_toqueBtn[data-side=left]{left:60px}
        .drk_toquePanel{position:fixed;bottom:86px;z-index:99991;width:300px;max-width:calc(100vw - 20px);max-height:75vh;overflow-y:auto;
            box-sizing:border-box;background:#161b22;border:1px solid #2a3442;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,.9);
            padding:14px;color:#c4cdd6;font:13px Verdana,Arial,sans-serif;-webkit-overflow-scrolling:touch}
        .drk_toquePanel[data-side=right]{right:10px}
        .drk_toquePanel[data-side=left]{left:10px}
        .drk_toquePanel h4{margin:0 0 8px;color:#9dbddd;font-size:14px}
        .drk_toquePanel label{display:block;margin:12px 0 4px}
        .drk_toquePanel label b{float:right;color:#fff}
        .drk_toquePanel input[type=range]{width:100%;height:32px;margin:0}
        .drk_toquePanel .drk_row{display:flex;gap:6px;margin-top:4px}
        .drk_toquePanel .drk_row button{flex:1;padding:10px 4px;border:0;border-radius:6px;background:#2a3442;color:#c4cdd6;font-size:12px}
        .drk_toquePanel .drk_row button.drk_on{background:#3d6a8f;color:#fff}
        .drk_toquePanel .drk_check{display:flex;align-items:center;justify-content:space-between;margin:12px 0 4px}
        .drk_toquePanel .drk_check input{width:24px;height:24px}
        .drk_toquePanel .drk_note{color:#7e8dab;font-size:11px;line-height:1.4;margin-top:10px}
    `);

    applyViewport();

    // ------------------------------------------------------------ painel de ajuste
    const openPanel = () =>
    {
        const old = document.querySelector('.drk_toquePanel');
        if(old) { old.remove(); return; }

        const panel = document.createElement('div');
        panel.className = 'drk_toquePanel';
        panel.dataset.side = settings.buttonSide;

        const cfg = current();

        const slider = (key, label, min, max, step, suffix = '×') => `
            <label>${label} <b data-out="${key}">${cfg[key]}${suffix}</b></label>
            <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${cfg[key]}">`;

        const choice = (key, label, options) => `
            <label>${label}</label>
            <div class="drk_row">${options.map(([value, text]) => `<button data-key="${key}" data-value="${value}" class="${cfg[key] == value ? 'drk_on' : ''}">${text}</button>`).join('')}</div>`;

        // mexer num tamanho passa para modo manual, a partir dos valores que estavam em uso
        const toManual = () =>
        {
            if(!settings.auto) return;
            Object.assign(settings, current(), { auto:false });
            const autoBox = panel.querySelector('input[data-key=auto]');
            if(autoBox) autoBox.checked = false;
            const info = panel.querySelector('.drk_detected');
            if(info) info.textContent = 'Manual: os teus valores, iguais em vertical e deitado.';
        };

        panel.innerHTML = `
            <h4>Ajustar para toque <span style="font-weight:400;color:#7e8dab;font-size:11px">v${GM_info?.script?.version || '?'}</span></h4>
            <div class="drk_note" style="margin:0 0 6px">Publicidade escondida: ${document.querySelectorAll('[data-drk-hidden="ad"]').length} · largura do ecrã: ${window.innerWidth} px · página: ${document.querySelector('meta[name=viewport]')?.content.split(',')[0].replace('width=', '') || '?'} px</div>
            <div class="drk_check"><span>Automático (conforme o ecrã)</span><input type="checkbox" data-key="auto" ${settings.auto ? 'checked' : ''}></div>
            <div class="drk_note drk_detected" style="margin-top:2px">${settings.auto ? `Detetado: ${detect().label}. Muda sozinho ao rodar o aparelho.` : 'Manual: os teus valores, iguais em vertical e deitado.'}</div>
            <div class="drk_check"><span>Ajustar a página à largura do ecrã</span><input type="checkbox" data-key="fitWidth" ${settings.fitWidth ? 'checked' : ''}></div>
            <div class="drk_check"><span>Enquadrar o jogo automaticamente</span><input type="checkbox" data-key="fitContent" ${settings.fitContent ? 'checked' : ''}></div>
            <div class="drk_note drk_fit" style="margin-top:2px">${settings.fitContent && settings.measuredWidth ? `Largura medida do jogo: ${settings.measuredWidth} px.` : 'Mede a largura real do jogo e ajusta a página a ela.'}</div>
            <div class="drk_check"><span>Esconder a publicidade lateral</span><input type="checkbox" data-key="hideAds" ${settings.hideAds ? 'checked' : ''}></div>
            ${slider('pageWidth', 'Largura da página (menor = tudo maior)', 800, 1600, 20, ' px')}
            ${slider('shortcutScale', 'Teclas de atalho', 1, 2.5, 0.1)}
            ${choice('shortcutPos', 'Posição das teclas de atalho', [['bottom', 'Em baixo'], ['right', 'À direita'], ['left', 'À esquerda']])}
            ${slider('buttonScale', 'Botões', 1, 2, 0.1)}
            ${slider('menuScale', 'Menu da esquerda', 1, 2, 0.1)}
            ${slider('planetScale', 'Lista de planetas', 1, 2, 0.1)}
            ${choice('buttonSide', 'Lado deste botão', [['right', 'Direita'], ['left', 'Esquerda']])}
            <div class="drk_row" style="margin-top:14px"><button data-action="reset">Repor tamanhos</button><button data-action="close">Fechar</button></div>
            <div class="drk_note">Mexer num tamanho passa para modo manual; liga \"Automático\" para voltar. A largura da página só muda ao recarregar (o botão de baixo recarrega). Os outros tamanhos mudam logo. Estes valores ficam guardados só neste dispositivo.</div>
            <div class="drk_row"><button data-action="reload">Aplicar largura e recarregar</button></div>
        `;

        panel.querySelectorAll('input[type=range]').forEach(input =>
        {
            input.addEventListener('input', () =>
            {
                const key = input.dataset.key;
                toManual();
                if(key == 'pageWidth' && settings.fitContent)
                {
                    settings.fitContent = false;
                    const box = panel.querySelector('input[data-key=fitContent]');
                    if(box) box.checked = false;
                }
                settings[key] = parseFloat(input.value);
                panel.querySelector(`[data-out="${key}"]`).textContent = `${settings[key]}${key == 'pageWidth' ? ' px' : '×'}`;
                setVars();
                save();
            });
        });

        panel.querySelectorAll('input[type=checkbox]').forEach(input =>
        {
            input.addEventListener('change', () =>
            {
                settings[input.dataset.key] = input.checked;
                save();
                applyViewport();
                setVars();
                if(input.dataset.key == 'auto') { panel.remove(); openPanel(); } // mostrar os valores do modo escolhido
                if(input.dataset.key == 'fitContent' && input.checked) { settings.measuredWidth = 0; measure(); }
                if(input.dataset.key == 'hideAds')
                {
                    if(input.checked) hideAds();
                    else document.querySelectorAll('[data-drk-hidden="ad"]').forEach(el => { el.style.removeProperty('display'); delete el.dataset.drkHidden; });
                    settings.measuredWidth = 0;
                    measure();
                }
            });
        });

        panel.querySelectorAll('button[data-key]').forEach(button =>
        {
            button.addEventListener('click', () =>
            {
                if(button.dataset.key != 'buttonSide') toManual();
                settings[button.dataset.key] = button.dataset.value;
                panel.querySelectorAll(`button[data-key="${button.dataset.key}"]`).forEach(b => b.classList.toggle('drk_on', b === button));
                save();
                setVars();
                placeButton();
                panel.dataset.side = settings.buttonSide;
            });
        });

        panel.querySelector('[data-action=close]').addEventListener('click', () => panel.remove());
        panel.querySelector('[data-action=reload]').addEventListener('click', () => { save(); window.location.reload(); });
        panel.querySelector('[data-action=reset]').addEventListener('click', () =>
        {
            Object.assign(settings, defaults);
            save();
            setVars();
            placeButton();
            panel.remove();
            openPanel();
        });

        document.body.appendChild(panel);
    };

    let button = null;
    const placeButton = () => { if(button) button.dataset.side = settings.buttonSide; };

    const start = () =>
    {
        setVars();

        button = document.createElement('div');
        button.className = 'drk_toqueBtn';
        button.textContent = '✋';
        button.title = 'Ajustar tamanhos para toque';
        button.addEventListener('click', openPanel);
        document.body.appendChild(button);
        placeButton();

        // ao rodar o aparelho, no modo automático, trocar de perfil (vertical/deitado)
        const onRotate = () =>
        {
            if(!settings.auto && !settings.fitContent) return;
            applyViewport();
            setVars();
            setTimeout(measure, 500);
            const info = document.querySelector('.drk_toquePanel .drk_detected');
            if(info) info.textContent = `Detetado: ${detect().label}. Muda sozinho ao rodar o aparelho.`;
        };

        // medir depois de o jogo e o DRAKO Command desenharem a página
        setTimeout(measure, 1200);
        setTimeout(measure, 4000);

        let rotateTimer = null;
        window.addEventListener('orientationchange', () => setTimeout(onRotate, 300));
        window.addEventListener('resize', () => { clearTimeout(rotateTimer); rotateTimer = setTimeout(onRotate, 300); });

        if(typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Toque: ajustar tamanhos', openPanel);

        // diagnóstico: o DRAKO Command está a correr neste aparelho? (no telemóvel não há consola)
        setTimeout(checkCommand, 8000);
    };

    const checkCommand = () =>
    {
        if(settings.hideDiagnosis) return;
        if(document.querySelector('.ogl_topbar, .ogl_shortcuts')) return; // está a funcionar
        // páginas sem a lista de planetas (Vista do Império, janelas à parte): o DRAKO Command não desenha a barra aí
        if(!document.querySelector('#planetList') || /component=empire|page=standalone|page=empire/.test(location.href)) return;

        // o DRAKO Command define a cor --ogl logo na primeira linha que corre, antes de arrancar
        const started = getComputedStyle(document.documentElement).getPropertyValue('--ogl').trim() !== '';
        const initialized = document.body.classList.contains('oglight');

        const text = !started
            ? 'O DRAKO Command não correu nesta página. Ou não está instalado neste browser, ou está desligado no Tampermonkey, ou o ficheiro ficou incompleto (no editor tem de acabar em <code>font-weight:400}`);</code>). Instala-o pelo Tampermonkey → Utilidades → Importar de ficheiro, sem copiar e colar.'
            : !initialized
                ? 'O DRAKO Command começou a carregar mas parou antes de arrancar (não encontrou a sessão do jogo ou os dados da página). Recarrega a página; se continuar, manda um print disto.'
                : 'O DRAKO Command arrancou mas parou a meio. Se houver uma faixa vermelha no topo, manda um print dela.';

        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:90px;z-index:99992;background:#5c4a0b;color:#fff;border:1px solid #c9a227;border-radius:8px;padding:10px 12px;font:13px/1.45 Verdana,Arial,sans-serif;box-shadow:0 0 15px #000';
        box.innerHTML = `<b>Diagnóstico (Toque)</b><br>${text}<div style="display:flex;gap:8px;margin-top:8px"><button data-a="ok" style="flex:1;padding:8px;border:0;border-radius:5px;background:#2a3442;color:#fff">Fechar</button><button data-a="never" style="flex:1;padding:8px;border:0;border-radius:5px;background:#2a3442;color:#fff">Não mostrar mais</button></div>`;
        box.querySelector('[data-a=ok]').addEventListener('click', () => box.remove());
        box.querySelector('[data-a=never]').addEventListener('click', () => { settings.hideDiagnosis = true; save(); box.remove(); });
        document.body.appendChild(box);
    };

    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
