const resource = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'blixt-internet';
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
    config: {},
    session: null,
    currentApp: 'home',
    mailBox: 'inbox',
    postApp: 'daveslist',
    posts: [],
    daveslistCategory: 'All',
    jobnetCategory: 'All',
    daveslistQuery: '',
    daveslistNotice: '',
    theme: { preset: 'original' },
    maximized: false,
    browserHistory: [],
    browserIndex: -1,
    browserCurrent: 'home',
    searchQuery: '',
    searchPage: 1,
    placeholderPages: {},
    adminMode: false,
    dialup: { connected: false, required: true, connecting: false }
};

const siteInfo = {
    darkmarket: {name:'DarkMarket',url:'http://www.darkmarket.net/',title:'DarkMarket'},
    shack: { name: 'The Computer Shack', url: 'http://www.computershack.net/', title: 'The Computer Shack' },
    motorheadz: { name: 'MotorHeadz', url: 'http://www.motorheadz.net/', title: 'MotorHeadz Car Club' },
    truthfiles: { name: 'The Truth Files', url: 'http://www.truthfiles.net/', title: 'The Truth Files' },
    search: { name: 'WooHoo! Search', url: 'http://www.woohoo.net/search', title: 'Search Results' },
    home: {
        name: 'WooHoo!',
        url: 'http://www.woohoo.net/',
        title: 'WooHoo!',
        subtitle: 'The World Wide Web directory'
    },
    mail: {
        name: 'MOL Mail',
        url: 'https://mail.mol.com/inbox',
        title: "MOL: 'Merica Online",
        subtitle: 'Electronic mail for modern people'
    },
    compose: {
        name: 'Compose MOL',
        url: 'https://mail.mol.com/compose',
        title: "MOL: 'Merica Online",
        subtitle: 'New electronic message'
    },
    daveslist: {
        name: 'daveslist',
        url: 'http://www.daveslist.net/',
        title: 'daveslist classifieds',
        subtitle: 'Buy, sell, trade, and probably haggle'
    },
    jobs: {
        name: 'JobNet',
        url: 'https://www.jobnet.net/listings',
        title: 'JobNet',
        subtitle: 'Local work, cash jobs, odd jobs, proper jobs'
    },
    network: {
        name: 'Network',
        url: 'https://network.windos.net/about',
        title: 'San Andreas Public Access Network',
        subtitle: 'Dial-up friendly terminal pages'
    }
};

// One lightweight cursor state for windows, navigation and NUI requests.
const windosBusy = { tokens: new Set(), timer: null, serial: 0 };
function syncWindosBusy() {
    document.body.classList.toggle('windos-busy', windosBusy.tokens.size > 0);
}
function startWindosBusy() {
    const token = ++windosBusy.serial;
    windosBusy.tokens.add(token);
    syncWindosBusy();
    return token;
}
function endWindosBusy(token) {
    if (token == null) return;
    windosBusy.tokens.delete(token);
    syncWindosBusy();
}
function pulseWindosBusy(ms = 430) {
    const token = startWindosBusy();
    setTimeout(() => endWindosBusy(token), ms);
}
function resetWindosBusy() {
    windosBusy.tokens.clear();
    syncWindosBusy();
}

function setWindosActive(active) {
    document.body.classList.toggle('windos-active', !!active);
}

async function nui(name, data = {}) {
    const busyToken = ['getMail', 'getPosts', 'getCommunity', 'addCommunity', 'truthTopics', 'truthTopic', 'truthCreate', 'truthReply', 'searchWeb', 'getPublicPost', 'sendEmail', 'markMailRead', 'createPost', 'registerEmail', 'saveComputerTheme', 'checkAdministration', 'openPoliceMDT'].includes(name) ? startWindosBusy() : null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await fetch(`https://${resource}/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(data),
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('NUI error', name, err);
        return { ok: false, message: err.name === 'AbortError' ? 'Connection timed out. Please try again.' : 'Terminal connection failed.' };
    } finally {
        clearTimeout(timeout);
        endWindosBusy(busyToken);
    }
}

function esc(str) {
    return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function fmtDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return esc(value);
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    return `$${n.toLocaleString()}`;
}

function setNotice(message, type = '') {
    if (!message) return '';
    return `<div class="notice ${type}">${esc(message)}</div>`;
}

const favorites = [
    { key: 'home', label: 'WooHoo!' },
    { key: 'mail', label: 'MOL Mail' },
    { key: 'daveslist', label: 'daveslist' },
    { key: 'jobs', label: 'JobNet' }
];

function browserRoute(app) {
    if (app === 'search' || String(app).startsWith('missing:')) return app;
    if (app === 'browser' || app === 'compose' || app === 'post') return app === 'browser' ? 'home' : app;
    return ['home', 'mail', 'daveslist', 'jobs', 'shack', 'motorheadz', 'truthfiles', 'darkmarket'].includes(app) ? app : null;
}

let browserLoadTimer = null;
let browserLoadSequence = 0;
let browserBusyToken = null;
function cancelBrowserLoad() {
    browserLoadSequence++;
    if (browserLoadTimer !== null) clearTimeout(browserLoadTimer);
    browserLoadTimer = null;
    document.body.classList.remove('windos-browser-busy');
    endWindosBusy(browserBusyToken);
    browserBusyToken = null;
}

function setBrowserLoading(route) {
    browserBusyToken = startWindosBusy();
    document.body.classList.add('windos-browser-busy');
    const status = $('.browser-statusbar span:first-child');
    if (status) status.textContent = `Opening ${siteInfo[route]?.url || 'website'}...`;
}

function navigateBrowser(app, fromHistory = false) {
    const route = browserRoute(app);
    if (!route) return Promise.resolve();
    cancelBrowserLoad();
    const sequence = browserLoadSequence;
    const isVisibleBrowser = !!$('.browser-frame') && $('#main-window').classList.contains('show');
    if (isVisibleBrowser) setBrowserLoading(route);
    return new Promise(resolve => {
        const finish = () => {
            browserLoadTimer = null;
            if (sequence !== browserLoadSequence) return resolve();
            if (route !== 'darkmarket') dmPendingProfile = '';
            if (!fromHistory && state.browserHistory[state.browserIndex] !== route) {
                state.browserHistory = state.browserHistory.slice(0, state.browserIndex + 1);
                state.browserHistory.push(route);
                if (state.browserHistory.length > 40) state.browserHistory.shift();
                state.browserIndex = state.browserHistory.length - 1;
            }
            state.browserCurrent = route;
            state.currentApp = route;
            document.body.classList.remove('windos-browser-busy');
            endWindosBusy(browserBusyToken);
            browserBusyToken = null;
            let result;
            if (!internetConnected()) result = renderOfflinePage(route);
            else if (route === 'home') result = renderHome();
            else if (route === 'search') result = renderWoohooResults();
            else if (route === 'darkmarket') result = renderDarkMarket();
            else if (route === 'mail') result = renderMail();
            else if (route === 'daveslist' || route === 'jobs') result = renderPosts(route);
            else if (route === 'compose') result = renderCompose();
            else if (route === 'post') result = renderPostForm('daveslist');
            else if (route.startsWith('missing:')) result = renderMissingPage(route);
            else if (publicGatewaySites[route]) result = renderGatewaySite(route);
            Promise.resolve(result).then(resolve, resolve);
        };
        // A short pause only for page-to-page navigation, not native WinDos applications.
        if (isVisibleBrowser) browserLoadTimer = setTimeout(finish, 720);
        else finish();
    });
}

function moveBrowserHistory(delta) {
    const next = state.browserIndex + delta;
    if (next < 0 || next >= state.browserHistory.length) return;
    state.browserIndex = next;
    navigateBrowser(state.browserHistory[next], true);
}

function browserAddressRoute(raw) {
    const input = String(raw || '').trim().toLowerCase();
    if (!input) return null;
    const short = { darkmarket:'darkmarket', home:'home', windos:'home', woohoo:'home', mail:'mail', mol:'mail', daveslist:'daveslist', jobs:'jobs', jobnet:'jobs' };
    if (short[input]) return short[input];
    let url;
    try { url = new URL(input.includes('://') ? input : 'http://' + input); } catch (_) { return null; }
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'woohoo.net' && url.pathname === '/search') {
        state.searchQuery = url.searchParams.get('q') || state.searchQuery;
        state.searchPage = 1;
        return 'search';
    }
    if (host === 'woohoo.net' || host === 'windos.net') return 'home';
    if (host === 'mail.mol.com') return 'mail';
    if (host === 'daveslist.net') return 'daveslist';
    if (host === 'darkmarket.net') return 'darkmarket';
    if (host === 'jobnet.net' || host === 'jobs.sanandreas.net') return 'jobs';
    const gateways = { 'computershack.net':'shack', 'motorheadz.net':'motorheadz', 'truthfiles.net':'truthfiles' };
    if (gateways[host]) {
        if (url.pathname !== '/' && url.pathname !== '') return missingPageRoute(gateways[host], url.pathname);
        return gateways[host];
    }
    return null;
}

function browserFavoritesHtml() {
    return favorites.map(item => `<button type="button" data-browser-favorite="${item.key}">${esc(item.label)}</button>`).join('');
}

function browserHistoryHtml() {
    const entries = state.browserHistory.slice(0, state.browserIndex + 1).slice().reverse();
    return entries.length ? entries.map(key => `<button type="button" data-browser-history="${esc(key)}">${esc(siteInfo[key]?.name || key)}</button>`).join('') : '<span class="browser-empty">No pages visited yet.</span>';
}

function browserGo() {
    const input = $('#browser-address');
    const route = browserAddressRoute(input?.value);
    if (route) return navigateBrowser(route);
    if (input) {
        input.setCustomValidity('This terminal only connects to listed San Andreas websites.');
        input.reportValidity();
        input.setCustomValidity('');
    }
}

function wireBrowser() {
    const back = $('[data-browser-back]');
    const forward = $('[data-browser-forward]');
    if (!back) return;
    back.disabled = state.browserIndex <= 0;
    forward.disabled = state.browserIndex >= state.browserHistory.length - 1;
    back.addEventListener('click', () => moveBrowserHistory(-1));
    forward.addEventListener('click', () => moveBrowserHistory(1));
    $('[data-browser-home]')?.addEventListener('click', () => navigateBrowser('home'));
    $('[data-browser-mail]')?.addEventListener('click', () => navigateBrowser('mail'));
    $('[data-browser-search]')?.addEventListener('click', () => { navigateBrowser('home').then(() => $('#woohoo-search-input')?.focus()); });
    $('[data-browser-refresh]')?.addEventListener('click', () => navigateBrowser(state.browserCurrent, true));
    $('[data-browser-go]')?.addEventListener('click', browserGo);
    $('#browser-address')?.addEventListener('keydown', e => { if (e.key === 'Enter') browserGo(); });
    $$('[data-browser-favorite]').forEach(button => button.addEventListener('click', () => navigateBrowser(button.dataset.browserFavorite)));
    $$('[data-browser-history]').forEach(button => button.addEventListener('click', () => {
        const key = button.dataset.browserHistory;
        const position = state.browserHistory.lastIndexOf(key, state.browserIndex);
        if (position !== -1) { state.browserIndex = position; navigateBrowser(key, true); }
    }));
    $$('[data-browser-panel]').forEach(button => button.addEventListener('click', () => {
        const target = $('#' + button.dataset.browserPanel);
        if (target) target.hidden = !target.hidden;
    }));
}

function siteBrand(siteKey) {
    if (siteKey === 'home') return `
        <div class="brand-woohoo">
            <img class="site-logo woohoo-image" src="./assets/images/woohoo-header.webp" alt="WooHoo!">
            <div class="woohoo-advert"><img src="./assets/images/burger-shot-1995.gif" width="468" height="60" alt="Burger Shot! 100% Real Beef!*" /></div>
            <form class="woohoo-search" id="woohoo-search-form">
                <label for="woohoo-search-input">Search the Web</label>
                <div class="woohoo-search-controls">
                    <input id="woohoo-search-input" type="search" autocomplete="off" aria-label="Search WooHoo!">
                    <button type="submit">Search</button>
                </div>
                <div id="woohoo-search-status" role="status"></div>
            </form>
        </div>`;
    if (siteKey === 'mail' || siteKey === 'compose') return `<div class="brand-mol"><img class="site-logo mol-image" src="./assets/images/mol-logo.png" alt="MOL 'Merica Online"></div>`;
    if (siteKey === 'daveslist') return `<div class="brand-daveslist">
        <img class="daveslist-logo" src="./assets/images/daveslist/logo.webp" width="390" height="91" alt="daveslist">
        <nav class="daveslist-nav" aria-label="daveslist navigation">
            <button type="button" class="dl-link" data-dl-home>home</button> |
            <button type="button" class="dl-link" data-dl-new>post an ad</button> |
            <button type="button" class="dl-link" data-dl-woohoo>woohoo!</button>
        </nav>
    </div>`;
    if (siteKey === 'jobs') return `
        <div class="brand-jobnet">
            <img class="site-logo jobnet-image" src="./assets/images/jobnet-logo.png" alt="JobNet">
            <nav class="jobnet-buttons" aria-label="JobNet navigation">
                <button type="button" data-jobnet-find aria-label="Find a Job"><img src="./assets/images/jobnet/find-job.png" alt="Find a Job"></button>
                <button type="button" data-jobnet-post aria-label="Post a Job"><img src="./assets/images/jobnet/post-job.png" alt="Post a Job"></button>
            </nav>
        </div>`;
    return '';
}

function websiteShell(siteKey, content, options = {}) {
    const info = siteInfo[siteKey] || siteInfo.home;
    const url = options.url || info.url;
    const nav = `
        <div class="browser-menu"><span>File</span><span>Edit</span><span>View</span><span>Favorites</span><span>Tools</span><span>Help</span></div>
        <div class="browser-toolbar">
            <button class="browser-tool" data-browser-back ${state.browserIndex <= 0 ? 'disabled' : ''}><img class="toolbar-art" src="./assets/icons/custom-back.png" alt="">Back</button>
            <button class="browser-tool" data-browser-forward ${state.browserIndex >= state.browserHistory.length - 1 ? 'disabled' : ''}><img class="toolbar-art" src="./assets/icons/custom-forward.png" alt="">Forward</button>
            <button class="browser-tool" data-browser-refresh><img class="toolbar-art" src="./assets/icons/custom-refresh.png" alt="">Refresh</button>
            <button class="browser-tool" data-browser-home><img class="toolbar-art" src="./assets/icons/custom-home.png" alt="">Home</button>
            <button class="browser-tool" data-browser-panel="favorites-panel"><img class="toolbar-art" src="./assets/icons/custom-favourites.png" alt="">Favorites</button>
            <button class="browser-tool" data-browser-panel="history-panel"><img class="toolbar-art" src="./assets/icons/custom-history.png" alt="">History</button>
            <button class="browser-tool" data-browser-search><img class="toolbar-art" src="./assets/icons/custom-search.png" alt="">Search</button>
            <button class="browser-tool" data-browser-mail><img class="toolbar-art" src="./assets/icons/custom-mail.png" alt="">Mail</button>
        </div>
        <div class="browser-address-row"><label for="browser-address">Address</label><input id="browser-address" value="${esc(url)}" spellcheck="false" autocomplete="off"><button class="browser-go" data-browser-go>Go</button></div>
        <div id="favorites-panel" class="browser-dropdown" hidden><strong>Favorites</strong>${browserFavoritesHtml()}</div>
        <div id="history-panel" class="browser-dropdown" hidden><strong>History</strong>${browserHistoryHtml()}</div>
    `;
    return `
        <div class="browser-frame">
            ${nav}
            <main class="webpage ${esc(siteKey)}-site">
                ${options.offline ? '' : siteBrand(siteKey)}
                ${content}
                ${options.offline || ['home','shack','motorheadz','truthfiles','darkmarket'].includes(siteKey) ? '' : `<footer class="site-footer">${siteKey === 'home' ? 'WooHoo! Directory · 1995' : siteKey === 'mail' || siteKey === 'compose' ? "© 1995 MOL" : siteKey === 'jobs' ? '© 1995 JobNet' : '© 1995 daveslist'}</footer>`}
            </main>
            <div class="browser-statusbar"><span>${options.offline ? "No connection" : "Done"}</span><span>${options.offline ? "Offline" : "🌐 Internet"}</span></div>
        </div>
    `;
}

function setWindow(title, body, siteKey = 'home', options = {}) {
    if (!options.native && !options.offline && !internetConnected()) return renderOfflinePage(siteKey);
    $('#main-window').classList.toggle('dialup-compact', options.dialup === true);
    $('#main-window').classList.add('show');
    $('#main-window').classList.remove('minimized');
    $('#task-label').classList.add('active');
    $('#window-title').textContent = title;
    $('#task-label').textContent = title;
    $('#window-body').innerHTML = options.native ? body : websiteShell(siteKey, body, options);
    $$('[data-open]').forEach(btn => btn.addEventListener('click', () => openApp(btn.dataset.open)));
    if (!options.native) {
        wireBrowser();
        if (siteKey === 'jobs') {
            $('[data-jobnet-find]')?.addEventListener('click', () => renderPosts('jobs'));
            $('[data-jobnet-post]')?.addEventListener('click', () => renderPostForm('jobs'));
        }
        if (siteKey === 'daveslist') {
            $$('[data-dl-home]').forEach(button => button.addEventListener('click', () => {
                state.daveslistCategory = 'All';
                state.daveslistQuery = '';
                renderDaveslist();
            }));
            $$('[data-dl-new]').forEach(button => button.addEventListener('click', () => renderDaveslistPostForm()));
            $$('[data-dl-woohoo]').forEach(button => button.addEventListener('click', () => navigateBrowser('home')));
        }
        $('#woohoo-search-form')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const query = $('#woohoo-search-input').value.trim();
            if (!query) { $('#woohoo-search-status').textContent = 'Enter something to search.'; return; }
            state.searchQuery = query;
            state.searchPage = 1;
            navigateBrowser('search');
        });
    }
}

function closeCurrentApp() {
    if (state.dialup.connecting) cancelDialup();
    cancelBrowserLoad();
    $('#main-window').classList.remove('show', 'maximized', 'minimized');
    state.maximized = false;
    $('#task-label').classList.remove('active');
    $('#task-label').textContent = 'Desktop';
    state.currentApp = 'desktop';
}

function applyScreenProfile(screen = {}) {
    const terminal = $('#terminal');
    if (!terminal) return;

    terminal.style.setProperty('--terminal-width', screen.width || '63vw');
    terminal.style.setProperty('--terminal-height', screen.height || '82vh');
    terminal.style.setProperty('--terminal-offset-x', screen.offsetX || '0vw');
    terminal.style.setProperty('--terminal-offset-y', screen.offsetY || '-1vh');
}

function updateSessionUi() {
    const email = state.session?.email;
    $('#session-email').textContent = email || 'No MOL';
    const unread = Number(state.session?.unread || 0);
    const badge = $('#mail-badge');
    if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : unread;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function updatePoliceMdtUi() {
    const mdt = state.config?.policeMdt || {};
    const icon = $('#police-mdt-icon');
    if (!icon) return;

    $('#police-mdt-label').textContent = mdt.label || 'Police MDT';
    const visible = mdt.available === true && mdt.enabled !== false;
    icon.classList.toggle('hidden', !visible);
    $('#start-police-mdt').hidden = !visible;
}

async function refreshSession() {
    const res = await nui('getSession');
    if (res?.ok) {
        state.session = res;
        updateSessionUi();
    }
    return res;
}


// Public directory sites are static content so server owners can swap artwork later.
const publicGatewaySites = {
    shack: { brand:'THE COMPUTER SHACK', subtitle:'YOUR HOME PC CONNECTION', banner:'shack', counter:'001284', updated:'10/12/95' },
    motorheadz: { brand:'MotorHeadz', subtitle:'THE CAR CLUB ON THE INFORMATION SUPERHIGHWAY', banner:'motorheadz', counter:'000763', updated:'09/28/95' },
    truthfiles: { brand:'THE TRUTH FILES', subtitle:'WE ASK THE QUESTIONS THEY WON’T', banner:'truthfiles', counter:'000419', updated:'10/18/95' },

};
const oldWebLink = (app,label) => `<button type="button" class="oldweb-link" data-oldweb-route="${app}">${esc(label)}</button>`;
const missingPageRoute = (site, path) => `missing:${site}:${String(path).replace(/^\/+/, '')}`;
const deadWebLink = (site, path, label) => oldWebLink(missingPageRoute(site, path), label);
function renderMissingPage(route) {
    const [, site, ...parts] = route.split(':');
    const root = siteInfo[site] || siteInfo.shack;
    const file = parts.join(':') || 'missing.html';
    setWindow('404 - File Not Found', `<div class="retro-404">
        <h2>404 - File Not Found</h2>
        <hr>
        <p><b>Sorry!</b> The requested document could not be found on this web server.</p>
        <p>It may have been moved, deleted, or is still under construction.</p>
        <p><small>Requested file: ${esc('/' + file)}</small></p>
        <p>${oldWebLink(site, 'Return to ' + root.name)}</p>
        <hr><small>${esc(root.name)} Web Server, 1995</small>
    </div>`, site, {url: root.url.replace(/\/$/, '') + '/' + file});
    wireOldWebLinks();
}

const siteEntries = {
    shack: `<h3>Welcome, fellow computer nut!</h3><p>Welcome to your number one stop for home PC advice. Got a 486? Just bought your first modem? Pull up a chair.</p>
        <div class="oldweb-two"><div><h4>Computer Help Desk</h4><ul><li>Getting online with a 14.4k modem</li><li>Disk cleanup and boot disks</li><li>What is a bulletin board?</li><li>Freeware of the month: PixelPaint 2.0</li></ul>
        <h4>Local Clubs</h4><p>San Andreas Computer Users Group meets every second Thursday. Bring your disks!</p></div>
        <div class="oldweb-ad"><b>HOT DOWNLOAD!</b><p>56K MODEM DRIVERS</p><small>Coming when somebody invents them!</small></div></div>
        <hr><h4>Bulletin Board Directory</h4><p>Do you still dial into BBS networks? Here's the list our members sent in:</p>
        <table class="oldweb-table"><tr><th>BBS</th><th>Interest</th><th>Status</th></tr><tr><td>PC HELP</td><td>Hardware</td><td>Online</td></tr><tr><td>GAMES 'N STUFF</td><td>Shareware</td><td>Online</td></tr></table>
        `,
    motorheadz: `<h3>MotorHeadz Club Newsletter</h3><p>Welcome to the home of grease, gears and good old American horsepower.</p>
        <div class="oldweb-two"><div><h4>October Garage Notes</h4><p><b>Featured:</b> Keeping that old Stanier running one more year.</p><p><b>Weekend cruise:</b> Meeting at the diner. No burnouts near the car park please.</p>
        <h4>Member Notices</h4><ul><li>Wanted: Carburettor parts for an old coupe.</li><li>Garage clearout this Saturday.</li><li>Have a look at ${oldWebLink('daveslist','daveslist classifieds')} for public listings.</li></ul></div>
        <div class="oldweb-ad"><b>GARAGE SALE</b><p>PARTS • TYRES • TOOLS</p><small>Ask about our monthly meet</small></div></div>
        `,
    truthfiles: `<h3>Case File 007: Strange Signals at Night</h3><p>Something is transmitting after midnight. Residents report odd radio bursts and a mysterious flicker near the highway.</p>
        <div class="oldweb-two"><div><h4>Latest Investigations</h4><ul><li>Strange lights over the desert</li><li>Did the government really close that road?</li><li>Numbers stations and unexplained transmissions</li></ul>
        </div>
        <div class="oldweb-ad"><b>YOU ARE VISITOR</b><p>000419</p><small>They are watching...</small></div></div>
        <hr><h4>Files We Cannot Verify</h4><p>Remember: our readers send these stories in. Decide for yourself what's real.</p>`,

};
function wireOldWebLinks() {
    $$('[data-oldweb-route]').forEach(button => button.addEventListener('click', () => navigateBrowser(button.dataset.oldwebRoute)));
}
function computerShackLayout() {
    return `<div class="shack-1995">
        <div class="shack-links-row">${oldWebLink('home','Web Directory')} &nbsp; | &nbsp; ${oldWebLink('shack','Home')} &nbsp; | &nbsp; ${deadWebLink('shack','downloads/index.html','Downloads')} &nbsp; | &nbsp; ${deadWebLink('shack','bbs/index.html','BBS List')} &nbsp; | &nbsp; <a href="#shack-message-board">Message Forum</a></div>
        <div class="shack-columns">
            <aside class="shack-links-column">
                <p><b><font color="#9a0000">THE TECH DESK</font></b></p>
                <p><span class="retro-new">NEW!</span> ${deadWebLink('shack','downloads/index.html','Free utilities')}</p>
                <p>${deadWebLink('shack','guides/modems.html',"Modem buyers' guide")}</p>
                <p>${deadWebLink('shack','clubs/meetings.html','Computer club meetings')}</p>
                <p>${deadWebLink('shack','guides/486.html','486 PC tips')}</p>
                <p>${deadWebLink('shack','software/index.html','Software library')}</p>
                <p><b><font color="#114a90">OUR SPONSOR</font></b></p>
                <button type="button" class="shack-ad-button" data-oldweb-route="${missingPageRoute('shack','sponsors/megabyte.html')}"><img class="shack-sponsor" src="./assets/images/computershack/megabyte.webp" alt="Mega Byte Computers advertisement"></button>
                <p class="shack-links-caption">${deadWebLink('shack','contact/webmaster.html','Email the webmaster')}</p>
            </aside>
            <div class="shack-content-column">
                <img class="shack-computer" src="./assets/images/computershack/computer.webp" alt="Desktop computer">
                <h3>Welcome to The Computer Shack!</h3>
                <p>Looking for PC tips? Need a new modem? Wondering what this "Internet" thing is all about? Pull up a chair!</p>
                <p><b><font color="#bd1010">What's New! (October 1995)</font></b></p>
                <ul class="shack-bullet-list">
                    <li>${deadWebLink('shack','downloads/pixelpaint.html','PixelPaint 2.0')} is here! NEW graphics utility!</li>
                    <li>${deadWebLink('shack','guides/modems.html','Getting online at 14.4K')} without losing your mind</li>
                    <li>New messages on the <a href="#shack-message-board">PC USERS FORUM</a></li>
                </ul>
                <div class="shack-downloads">
                    <b><font color="#063d9d">FREEWARE &amp; SHAREWARE CORNER</font></b>
                    <p><b>Try these:</b> ${deadWebLink('shack','downloads/pixelpaint.html','PixelPaint 2.0')} (FREE!) &nbsp; ${deadWebLink('shack','downloads/modemdoctor.html','Modem Doctor 1.1')} (shareware)</p>
                    <a class="shack-placeholder-ad" href="#shack-message-board" title="Visit our forum"><img class="shack-freeware" src="./assets/images/computershack/freeware.webp" alt="Freeware and Shareware software"></a>
                </div>
                <p><b><font color="#9a0000">LOCAL COMPUTER CLUB</font></b><br>Meets on the second Thursday of every month. Bring your own floppy disks. ${deadWebLink('shack','clubs/meetings.html','More info...')}</p>
                <p class="shack-small">Been hearing more talk about <i>hacking</i> on the boards lately. Some of those hacker sites don't seem to be listed anywhere.</p>
                <p><b>Bulletin Board Directory</b><br>${deadWebLink('shack','bbs/pchelp.html','PC HELP')} &nbsp; - &nbsp; ${deadWebLink('shack','bbs/games.html',"GAMES 'N STUFF")}</p>
                <hr class="shack-rule">
                <div id="shack-message-board"><h3 class="shack-forum-title"><img src="./assets/images/computershack/floppy.gif" alt="" class="shack-floppy"> THE COMPUTER SHACK FORUM</h3>
                    <p>Ask a question, trade computer tips, and leave a message for other users!</p>
                    <div id="gateway-community"></div>
                </div>
            </div>
        </div>
    </div>`;
}
function gatewayLayout(key) {
    if (key === 'shack') return computerShackLayout();
    const ads = {
        shack: `<aside class="retro-side"><strong>THE TECH DESK</strong><p><span class="retro-new">NEW!</span> ${deadWebLink('shack','downloads/index.html','Free utilities')}</p><p>${deadWebLink('shack','guides/modems.html',"Modem buyers' guide")}</p><p>${deadWebLink('shack','clubs/meetings.html','Computer club meetings')}</p><p>Visit our sponsors!</p><button type="button" class="shack-ad-button" data-oldweb-route="${missingPageRoute('shack','sponsors/megabyte.html')}"><img class="shack-sponsor" src="./assets/images/computershack/megabyte.webp" alt="Mega Byte Computers: 486 PCs and upgrades"></button></aside>`,
        motorheadz:`<aside class="retro-side"><strong>THE GARAGE</strong><p>CLUB MEETS</p><p>PARTS & SWAPS</p><p>MEMBERS' RIDES</p><div class="retro-ad">TIRES! TIRES! TIRES!<br>HOT DEALS</div></aside>`,
        truthfiles:`<aside class="retro-side"><strong>TOP SECRET?</strong><p>AREA 69 REPORTS</p><p>MISSING FILES</p><p>RADIO SIGNALS</p><div class="retro-ad">EYES ONLY<br>CASE 007<br>YOU HAVE BEEN WARNED</div></aside>`,
    };
    const hero = {
        shack:`<div class="retro-box"><img class="shack-computer" src="./assets/images/computershack/computer.webp" alt="Retro desktop computer"><b>Welcome to the PC HELP DESK!</b><p>Memory trouble? Dial-up too slow? Pull up a chair.</p><table class="oldweb-table"><tr><th>DOWNLOAD</th><th>VERSION</th><th>STATUS</th></tr><tr><td>${deadWebLink('shack','downloads/pixelpaint.html','PixelPaint')}</td><td>2.0</td><td>FREEWARE</td></tr><tr><td>${deadWebLink('shack','downloads/modemdoctor.html','Modem Doctor')}</td><td>1.1</td><td>SHAREWARE</td></tr></table><img class="shack-freeware" src="./assets/images/computershack/freeware.webp" alt="Freeware and shareware software banner"><p class="retro-tiny">Sysop's board directory:</p><p>${deadWebLink('shack','bbs/pchelp.html','PC HELP')} / ${deadWebLink('shack','bbs/games.html',"GAMES 'N STUFF")}</p></div><h3 class="shack-forum-title"><img src="./assets/images/computershack/floppy.gif" alt="" class="shack-floppy"> THE COMPUTER SHACK FORUM</h3><p>Ask a question, trade computer tips and leave a message for other users!</p>`,
        motorheadz:`<div class="retro-spot"><span class="retro-new">HOT RIDE!</span><div class="retro-picture">[ FEATURE CAR PHOTO ]</div><h3>MotorHeadz Member Showcase</h3><p>Show everyone what you drive. Got a Stanier worth showing off? Post a photo link below.</p></div><div class="retro-box">SATURDAY NIGHT CRUISE • PARTS SWAP • GARAGE TALK</div>`,
        truthfiles:`<div class="retro-warning">!! THIS INFORMATION HAS NOT BEEN VERIFIED !!</div><div class="retro-spot"><div class="retro-picture">[ GRAINY UFO EVIDENCE ]</div><h3>CASE FILE 007: STRANGE SIGNALS AT NIGHT</h3><p>Unidentified lights reported over the desert. Residents heard radio transmissions at 2:17 AM.</p></div>`,

    };
    const nav = {
        shack:`<div class="retro-menu">[ ${oldWebLink('home','WEB DIRECTORY')} ] [ ${oldWebLink('shack','HOME')} ] [ ${deadWebLink('shack','bbs/index.html','BBS LIST')} ]</div>`,
        motorheadz:`<div class="retro-menu">${oldWebLink('motorheadz','HOME')} | ${oldWebLink('daveslist','CLASSIFIEDS')} | MEMBER RIDES | CLUB NEWS</div>`,
        truthfiles:`<div class="retro-menu">[ ${oldWebLink('truthfiles','LATEST CASES')} ]</div>`,

    };
    return `<div class="retro-layout"><div class="retro-sidebar">${ads[key]}</div><main class="retro-main">${hero[key]}<div id="gateway-community"></div></main></div>`;
}

function motorHeadzLayout() {
    return `<div class="motor-1995">
        <div class="motor-links">${oldWebLink('motorheadz','HOME')} &nbsp; :: &nbsp; ${oldWebLink('daveslist','CLASSIFIEDS')} &nbsp; :: &nbsp; <a href="#motor-rides">MEMBERS RIDES</a> &nbsp; :: &nbsp; ${deadWebLink('motorheadz','club/meetings.html','CLUB MEETS')} &nbsp; :: &nbsp; ${deadWebLink('motorheadz','garage/tips.html','GARAGE TIPS')}</div>
        <div class="motor-content">
            <aside class="motor-small-column">
                <b><font color="#c32000">THE GARAGE</font></b>
                <p>${deadWebLink('motorheadz','club/meetings.html','Local cruise nights')}</p>
                <p>${deadWebLink('motorheadz','garage/tips.html','Keep your old ride running')}</p>
                <p>${oldWebLink('daveslist','Parts &amp; classified ads')}</p>
                <p class="motor-small-note"><b>OCTOBER '95</b><br>Saturday night cruise at the diner. No burnouts out front, fellas!</p>
                <a href="#motor-rides" class="motor-mini-link">★ SHOW OFF YOUR RIDE ★</a>
                <p><b>OUR SPONSOR</b></p>
                <button type="button" class="motor-ad-button" data-oldweb-route="${missingPageRoute('motorheadz','sponsors/speedgrip.html')}"><img src="./assets/images/motorheadz/speedgrip.webp" alt="SpeedGrip Tyres great prices"></button>
                <p class="motor-small-note">Anyone still running nitrous? Heard the cops have been cracking down on that stuff. It's becoming hard to find now, but I hear there's an online market for it. Just need to find it.</p><p class="motor-small-note">Got parts? Looking for a buyer? Try ${oldWebLink('daveslist','daveslist')} first.</p>
            </aside>
            <main class="motor-primary">
                <b><font size="4" color="#b91506">WELCOME TO MOTORHEADZ!</font></b>
                <p>Hot rods, old wrecks, loud pipes and weekend cruises. If it's got wheels, we wanna see it!</p>
                <p class="motor-hot"><b>HOT RIDE! ★ OCTOBER MEMBER SPOTLIGHT</b></p>
                <img class="motor-feature-photo" src="./assets/images/motorheadz/featured.webp" alt="Classic car at a night lookout">
                <small><b>Big night up in the hills!</b> One of the lads brought his pride and joy out for the club photo. Got a better shot? Send us yours below!</small>
                <p class="motor-caption">${deadWebLink('motorheadz','photos/october95.html','More club photos...')} &nbsp; ${deadWebLink('motorheadz','features/ride-of-the-month.html','Ride of the month')}</p>
                <h3><font color="#a32202">What's happening at the garage?</font></h3>
                <ul><li>${deadWebLink('motorheadz','club/meetings.html','Cruise and BBQ this Saturday!')} Bring your mates.</li><li>${deadWebLink('motorheadz','garage/tips.html','Carburettor trouble?')} Some tips from RustyWrench.</li><li>${oldWebLink('daveslist','Got an old motor to sell?')} Check the classifieds.</li></ul>
                <a class="motor-cruise-link" href="#motor-rides" title="See member rides"><img src="./assets/images/motorheadz/cruise.webp" alt="MotorHeadz Cruise Night: Cars, music, BBQ"></a>
                <div id="motor-rides"><h3><font color="#9d2010">MEMBER RIDES PHOTO BOARD</font></h3><p>Stick a photo of your pride and joy on the club board. Just paste a direct image link. Everyone on the server can see it.</p><div id="gateway-community"></div></div>
            </main>
        </div>
    </div>`;
}

const truthCats = [
    ['sightings','Strange Sightings','UFOs, odd lights, unusual people and things seen around San Andreas'],
    ['government','Government & Cover-Ups','Area 69, missing records and suspicious officials'],
    ['paranormal','Paranormal & Legends','Ghosts, strange creatures and local legends'],
    ['theories','Rumours & Theories','Wild ideas, strange coincidences and things that do not add up'],
    ['general','General Discussion','Everything else weird and wonderful']
];
let truthViewSerial = 0;
function truthFilesLayout() {
    return `<div class="truth-nav"><a href="#" data-truth-view="home">HOME</a> : <a href="#" data-truth-view="forum">MESSAGE BOARDS</a> : <a href="#" data-truth-view="new">SUBMIT A STORY</a></div>
    <div class="truth-columns"><main class="truth-primary"><div id="truth-content"></div></main>
    <aside class="truth-aside"><b>THE TRUTH INDEX</b><p><a href="#" data-truth-cat="sightings">Strange sightings</a><br><a href="#" data-truth-cat="government">Government secrets</a><br><a href="#" data-truth-cat="paranormal">Local legends</a><br><a href="#" data-truth-cat="theories">Conspiracy theories</a></p>
    <a href="#" data-truth-view="new"><img src="./assets/images/truthfiles/advert.webp" alt="They are watching you - submit a report"></a>
    <p class="truth-small">Independent investigators since 1995.<br>Don't believe everything you read.</p>
    <p><a href="#" data-truth-view="forum">ENTER THE FORUM &gt;&gt;</a></p></aside></div>`;
}
function truthContent() { return document.querySelector('#truth-content'); }
function truthWire() {
    const page = document.querySelector('.oldweb-truthfiles');
    if (!page || page.dataset.truthWired === '1') return;
    page.dataset.truthWired = '1';
    page.addEventListener('click', e => {
        const link = e.target.closest('[data-truth-view], [data-truth-cat], [data-truth-id], [data-truth-darkmarket]');
        if (!link || !page.contains(link)) return;
        e.preventDefault();
        if (link.hasAttribute('data-truth-darkmarket')) dmOpenTruthProfile();
        else if (link.hasAttribute('data-truth-cat')) showTruthForum(link.dataset.truthCat);
        else if (link.hasAttribute('data-truth-id')) showTruthTopic(Number(link.dataset.truthId));
        else if (link.dataset.truthView === 'home') showTruthHome();
        else if (link.dataset.truthView === 'new') showTruthNew();
        else showTruthForum();
    });
}

function truthCategoriesHtml() { return `<ul class="truth-category-list">${truthCats.map(c=>`<li><a href="#" data-truth-cat="${c[0]}">${c[1]}</a> <small>${c[2]}</small></li>`).join('')}</ul>`; }
async function showTruthHome() {
    const seq=++truthViewSerial;const target=truthContent();if(!target)return;
    target.innerHTML=`<p class="truth-alert">!! THE TRUTH IS NOT ALWAYS WHAT THEY TELL YOU !!</p>
    <h2>WELCOME, FELLOW TRUTH SEEKER.</h2><p>You've reached the home of an independent San Andreas investigator. Strange happenings, missing records, unbelievable sightings and rumours nobody else will print. Send in your own report!</p>
    <h3><font color="#a4ff7a">FEATURED CASE: THE LIGHTS BEHIND AREA 69</font></h3>
    <img class="truth-evidence" src="./assets/images/truthfiles/evidence.webp" alt="A grainy 1995 photograph of unexplained lights over the desert">
    <p><small>READER EVIDENCE, 12 AUG 1995</small><br>Unexplained lights beyond the perimeter fence. Officials say nothing happened. You be the judge.</p>
    <p><a href="#" data-truth-view="forum">[ READ THE COMMUNITY REPORTS ]</a> &nbsp; <a href="#" data-truth-view="new">[ SEND YOUR STORY ]</a></p>
    <h3>LATEST READER REPORTS</h3><div id="truth-recent">Dialling the message boards...</div>
    <a href="#" data-truth-view="forum"><img class="truth-warning-img" src="./assets/images/truthfiles/warning.webp" alt="The truth is out there - UFOs, government secrets, cover ups and more"></a>
    <h3>DISCUSSION ROOMS</h3>${truthCategoriesHtml()}
    <p class="truth-small">I've got a task that needs taking care of. Can't say what here... hit me up over <a href="#" data-truth-darkmarket>HERE</a>.</p>`;
    truthWire();const res=await nui('truthTopics',{});if(seq!==truthViewSerial||!truthContent())return;
    document.querySelector('#truth-recent').innerHTML=res.ok&&Array.isArray(res.topics)&&res.topics.length?res.topics.slice(0,7).map(t=>`<p>★ <a href="#" data-truth-id="${t.id}">${esc(t.title)}</a> <small>by ${esc(t.nickname)}</small></p>`).join(''):res.ok?'<p>No reports received yet. Be the first!</p>':`<p>${esc(res.message||'Could not load reports.')} <a href="#" data-truth-view="home">[ TRY AGAIN ]</a></p>`;
}
async function showTruthForum(category='') {
    const seq=++truthViewSerial;const target=truthContent();if(!target)return;
    const name=truthCats.find(c=>c[0]===category)?.[1]||'THE TRUTH FILES MESSAGE BOARDS';
    target.innerHTML=`<h2>${esc(name)}</h2><p><a href="#" data-truth-view="home">Home</a> &gt; <a href="#" data-truth-view="forum">Message Boards</a> ${category?'&gt; '+esc(name):''}</p>
    ${truthCategoriesHtml()}<p><a href="#" data-truth-view="new"><b>[ POST A NEW STORY ]</b></a></p><hr><div id="truth-topics">Connecting to forum...</div>`;
    truthWire();const res=await nui('truthTopics',{category});if(seq!==truthViewSerial||!truthContent())return;
    document.querySelector('#truth-topics').innerHTML=res.ok&&Array.isArray(res.topics)&&res.topics.length?`<table class="truth-topic-table"><tr><th>SUBJECT</th><th>POSTED BY</th><th>REPLIES</th></tr>${res.topics.map(t=>`<tr><td><a href="#" data-truth-id="${t.id}">${esc(t.title)}</a><br><small>${esc(truthCats.find(c=>c[0]===t.category)?.[1]||t.category)}</small></td><td>${esc(t.nickname)}<br><small>${esc(fmtDate(t.created_at))}</small></td><td>${Number(t.replies)||0}</td></tr>`).join('')}</table>`:res.ok?'<p>No stories in this section yet.</p>':`<p>${esc(res.message||'Could not load stories.')} <a href="#" data-truth-cat="${esc(category)}">[ TRY AGAIN ]</a></p>`;truthWire();
}
async function showTruthTopic(id,notice='') {
    const seq=++truthViewSerial;const target=truthContent();if(!target)return;target.innerHTML='<p>Retrieving case file...</p>';
    const res=await nui('truthTopic',{id});if(seq!==truthViewSerial||!truthContent())return;
    if(!res.ok){target.innerHTML=`<p>${esc(res.message||'Case file not found.')}</p>`;return;}
    const t=res.topic;target.innerHTML=`<p><a href="#" data-truth-view="forum">&lt;&lt; Back to discussion boards</a></p><h2>${esc(t.title)}</h2>
    <div class="truth-post">${dmAdminButton('truthTopic', t.id)}<small>Filed by ${esc(t.nickname)} / ${esc(fmtDate(t.created_at))}</small><p>${esc(t.body).replace(/\n/g,'<br>')}</p>${t.image_url&&/^https?:\/\//i.test(t.image_url)?`<img class="truth-post-image" src="${esc(t.image_url)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:''}</div>
    <h3>REPLIES (${(res.replies||[]).length})</h3>${(res.replies||[]).map(r=>`<div class="truth-reply">${dmAdminButton('truthReply', r.id)}<b>${esc(r.nickname)}</b> <small>${esc(fmtDate(r.created_at))}</small><p>${esc(r.body).replace(/\n/g,'<br>')}</p></div>`).join('')||'<p>There are no replies yet.</p>'}
    <h3>POST A REPLY</h3>${notice?`<p>${esc(notice)}</p>`:''}<form id="truth-reply-form" class="truth-form"><label>Alias <input name="nickname" maxlength="40" required></label><label>Message <textarea name="body" rows="4" maxlength="1500" required></textarea></label><button type="submit">SEND REPLY</button></form>`;
    truthWire();document.querySelector('#truth-reply-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=new FormData(f);const b=f.querySelector('button');b.disabled=true;const out=await nui('truthReply',{id,nickname:fd.get('nickname'),body:fd.get('body')});if(out.ok)showTruthTopic(id,'Reply posted.');else{b.disabled=false;alert(out.message||'Could not post.');}});
}
function showTruthNew(notice='') {
    ++truthViewSerial;const target=truthContent();if(!target)return;
    target.innerHTML=`<p><a href="#" data-truth-view="forum">&lt;&lt; Message Boards</a></p><h2>SUBMIT YOUR STORY!</h2><p>Seen something strange? Got a theory? Heard a rumour? Tell the readers of San Andreas.</p>
    ${notice?`<p>${esc(notice)}</p>`:''}<form id="truth-new-form" class="truth-form"><label>Choose a board <select name="category" required>${truthCats.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('')}</select></label><label>Your alias <input name="nickname" maxlength="40" required></label><label>Subject <input name="title" maxlength="120" required></label><label>Story <textarea name="body" maxlength="2500" rows="8" required></textarea></label><label>Evidence photograph URL (optional) <input name="imageUrl" maxlength="512" type="url" placeholder="https://..."></label><button type="submit">SUBMIT REPORT</button></form>`;
    truthWire();document.querySelector('#truth-new-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,fd=new FormData(f);const b=f.querySelector('button');b.disabled=true;const out=await nui('truthCreate',Object.fromEntries(fd.entries()));if(out.ok)showTruthTopic(out.id);else{b.disabled=false;alert(out.message||'Could not submit.');}});
}

function renderGatewaySite(key) {
    const site = publicGatewaySites[key];
    setWindow(siteInfo[key].title, `<div class="oldweb oldweb-${key} retro-page">
        <div class="oldweb-masthead"><img src="${key === 'shack' ? './assets/images/computershack/logo.webp' : key === 'motorheadz' ? './assets/images/motorheadz/logo.webp' : key === 'truthfiles' ? './assets/images/truthfiles/logo.webp' : './assets/images/gateways/' + site.banner + '.svg'}" alt="${esc(site.brand)}" class="oldweb-banner">${key === 'shack' || key === 'motorheadz' || key === 'truthfiles' ? '' : `<p>${esc(site.subtitle)}</p>`}</div>
        ${key === 'motorheadz' ? motorHeadzLayout() : key === 'truthfiles' ? truthFilesLayout() : gatewayLayout(key)}
        <p class="oldweb-copyright">© 1995 ${esc(site.brand === 'THE COMPUTER SHACK' ? 'The Computer Shack' : site.brand)}</p>
    </div>`, key);
    const mast = $('.oldweb-masthead');

    wireOldWebLinks();
    if (key === 'shack' || key === 'motorheadz') loadGatewayCommunity(key);
    if (key === 'truthfiles') showTruthHome();
}

async function loadGatewayCommunity(site, notice = '') {
    const target = $('#gateway-community');
    if (!target) return;
    const res = await nui('getCommunity', {site});
    if (!$('#gateway-community') || state.browserCurrent !== site) return;
    const entries = res.ok ? (res.entries || []) : [];
    const cards = entries.map(entry => `<div class="retro-community-entry">${state.adminMode ? dmAdminButton('community', entry.id) : ''}
        ${entry.image_url && /^https?:\/\//i.test(entry.image_url) ? `<img src="${esc(entry.image_url)}" alt="Member photo" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
        <b>${esc(entry.title)}</b><br><small>Posted by ${esc(entry.nickname)} • ${esc(fmtDate(entry.created_at))}</small><p>${esc(entry.body)}</p>
    </div>`).join('');
    const car = site === 'motorheadz';
    $('#gateway-community').innerHTML = `<div class="retro-community"><div class="retro-section-head">${car ? 'MEMBER RIDES - PHOTO GALLERY' : 'PC USERS MESSAGE FORUM'}</div>
        <p>${car ? 'Your ride could be featured here! Paste a direct image link.' : 'Post a question or tip for fellow computer nuts.'}</p>
        ${notice ? `<p class="retro-notice">${esc(notice)}</p>` : ''}
        <form id="gateway-community-form">
            <label>Nickname <input name="nickname" maxlength="40" required></label>
            <label>${car ? 'Vehicle / caption' : 'Topic'} <input name="title" maxlength="100" required></label>
            ${car ? '<label>Photo URL (http/https) <input name="imageUrl" maxlength="512" type="url" required placeholder="https://..."></label>' : ''}
            <label>${car ? 'Tell us about your ride' : 'Message'} <textarea name="body" maxlength="700" rows="3" required></textarea></label>
            <button type="submit">${car ? 'ADD MY RIDE' : 'POST MESSAGE'}</button>
        </form><hr><div class="retro-entries">${cards || '<p>No member posts yet. Be the first!</p>'}</div></div>`;
    $('#gateway-community-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        const button = form.querySelector('button');
        button.disabled = true;
        const out = await nui('addCommunity', {site, nickname:fd.get('nickname'),title:fd.get('title'),body:fd.get('body'),imageUrl:fd.get('imageUrl') || ''});
        if (out.ok) loadGatewayCommunity(site, 'Posted successfully!');
        else { button.disabled = false; let msg = form.querySelector('.form-error'); if (!msg) { msg = document.createElement('p'); msg.className = 'form-error'; form.append(msg); } msg.textContent = out.message || 'Could not post.'; }
    });
}

const woohooSites = [
    { title: 'The Computer Shack', url: 'www.computershack.net', desc: 'Home computer tips, dial-up guides, freeware and BBS directories.', app: 'shack', keywords: 'computer modem bulletin board bbs technology freeware internet dialup' },
    { title: 'MotorHeadz Car Club', url: 'www.motorheadz.net', desc: 'Local car enthusiasts, garage notices, tuning and motoring talk.', app: 'motorheadz', keywords: 'car motor vehicle engine garage auto parts classics' },
    { title: 'The Truth Files', url: 'www.truthfiles.net', desc: 'Odd reports, local mysteries and unexplained events.', app: 'truthfiles', keywords: 'ufo alien conspiracy mystery sightings government files' },
    { title: 'daveslist classifieds', url: 'www.daveslist.net', desc: 'Local advertisements, vehicles, goods and community classifieds.', app: 'daveslist', keywords: 'sale buy sell vehicles shopping classified' },
    { title: 'JobNet', url: 'www.jobnet.net/listings', desc: 'Browse local employment opportunities and available work.', app: 'jobs', keywords: 'work jobs hiring employment career' },
    { title: "MOL: 'Merica Online", url: 'mail.mol.com', desc: 'Electronic mail and online communications. Private messages are never searched.', app: 'mail', keywords: 'email electronic mail mol' },
    { title: 'WooHoo! Internet Directory', url: 'www.woohoo.net', desc: 'Discover websites and services on the World Wide Web.', app: 'home', keywords: 'search directory internet websites' }
];

async function renderWoohooResults() {
    const query = state.searchQuery.trim();
    const page = state.searchPage;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const sites = woohooSites.filter(site => words.every(word => `${site.title} ${site.desc} ${site.keywords}`.toLowerCase().includes(word)));
    const [res, privateResult] = await Promise.all([nui('searchWeb', { query, page }), nui('darkmarket', { action:'discover', query })]);
    if (state.browserCurrent !== 'search' || state.searchQuery.trim() !== query || state.searchPage !== page) return;
    const posts = res?.ok ? (res.posts || []) : [];
    const total = res?.ok ? Number(res.total || 0) : 0;
    const pages = Math.max(1, Math.ceil(total / 20));
    const hiddenSite = privateResult?.ok && privateResult.found;
    const resultCount = total + sites.length + (hiddenSite ? 1 : 0);
    setWindow('WooHoo! Search Results', `
        <section class="woohoo-results-page">
            <h2>WooHoo! Search Results</h2>
            <form id="woohoo-results-form" class="woohoo-results-form"><label for="woohoo-results-input">Search the Web:</label> <input id="woohoo-results-input" maxlength="100" value="${esc(query)}"> <button type="submit">Search</button></form>
            <hr>
            ${res?.ok === false ? '<p>Search is unavailable. Please try again.</p>' : resultCount === 0 ? '<p>No results found.</p>' : `
                <p>Found ${resultCount} match${resultCount === 1 ? '' : 'es'} for <b>${esc(query)}</b>.</p>
                ${hiddenSite ? `<ul class="woohoo-results-list"><li><button class="woohoo-result-link" data-result-app="darkmarket">DarkMarket Private Network</button><span class="woohoo-result-address">www.darkmarket.net</span><div>Discussion boards and private classifieds. Registration open.</div></li></ul>` : ''}
                ${sites.length ? `<h3>Directory Matches</h3><ul class="woohoo-results-list">${sites.map(site => `<li><button class="woohoo-result-link" data-result-app="${site.app}">${esc(site.title)}</button><span class="woohoo-result-address">${esc(site.url)}</span><div>${esc(site.desc)}</div></li>`).join('')}</ul>` : ''}
                ${posts.length ? `<h3>Site Matches</h3><ul class="woohoo-results-list">${posts.map(post => `<li><button class="woohoo-result-link" data-result-post="${Number(post.id)}" data-result-source="${esc(post.app)}">${esc(post.title)}</button><span class="woohoo-result-address">${post.app === 'jobs' ? 'www.jobnet.net/listings/' : 'www.daveslist.net/'}${Number(post.id)}</span><div>${esc(String(post.body || '').slice(0, 175))}${String(post.body || '').length > 175 ? '...' : ''}</div></li>`).join('')}</ul>` : ''}
                ${total > 20 ? `<div class="woohoo-results-pages">Page ${page} of ${pages} ${page > 1 ? '<button data-search-page="prev">Previous</button>' : ''} ${page < pages ? '<button data-search-page="next">Next</button>' : ''}</div>` : ''}
            `}
            <hr><button class="woohoo-result-link" data-result-app="home">Return to WooHoo!</button>
        </section>
    `, 'home', { url: `http://www.woohoo.net/search?q=${encodeURIComponent(query)}` });
    $('#woohoo-results-form')?.addEventListener('submit', event => {
        event.preventDefault();
        state.searchQuery = $('#woohoo-results-input').value.trim();
        if (!state.searchQuery) return;
        state.searchPage = 1;
        navigateBrowser('search', true);
    });
    $$('[data-result-app]').forEach(button => button.addEventListener('click', () => navigateBrowser(button.dataset.resultApp)));
    $$('[data-result-post]').forEach(button => button.addEventListener('click', () => openWoohooPost(button.dataset.resultSource, Number(button.dataset.resultPost))));
    $$('[data-search-page]').forEach(button => button.addEventListener('click', () => {
        state.searchPage += button.dataset.searchPage === 'next' ? 1 : -1;
        renderWoohooResults();
    }));
}

async function openWoohooPost(app, id) {
    const res = await nui('getPublicPost', { app, id });
    if (!res?.ok || !res.post) return;
    state.postApp = app === 'jobs' ? 'jobs' : 'daveslist';
    state.posts = [res.post];
    openPost(res.post);
}

function renderHome() {
    const email = state.session?.email;
    const domain = state.config.domain || 'mol.com';
    setWindow('Internet Explorer', `
        <section class="w95-page woohoo-1995">
            <div class="woohoo-directory" aria-label="Browse websites by category">
                <ul class="woohoo-directory-column">
                    <li class="woohoo-category">
                        <h2>Computers &amp; Internet</h2>
                        <p><button class="text-link" data-open="shack">The Computer Shack</button> <span>· Computers, software, clubs</span></p>
                    </li>
                    <li class="woohoo-category">
                        <h2>Business &amp; Employment</h2>
                        <p><button class="text-link" data-open="jobs">JobNet</button> <span>· Jobs, opportunities, classifieds</span></p>
                    </li>
                    <li class="woohoo-category">
                        <h2>Communications</h2>
                        <p><button class="text-link" data-open="mail">MOL Mail</button> <span>· Electronic mail and messages</span></p>
                    </li>
                </ul>
                <ul class="woohoo-directory-column">
                    <li class="woohoo-category">
                        <h2>Shopping &amp; Classifieds</h2>
                        <p><button class="text-link" data-open="daveslist">daveslist</button> <span>· Buy, sell and trade</span></p>
                    </li>
                    <li class="woohoo-category">
                        <h2>Recreation &amp; Motoring</h2>
                        <p><button class="text-link" data-open="motorheadz">MotorHeadz</button> <span>· Cars, garages, club meets</span></p>
                    </li>
                    <li class="woohoo-category">
                        <h2>Hobbies &amp; Oddities</h2>
                        <p><button class="text-link" data-open="truthfiles">The Truth Files</button> <span>· UFOs, mysteries, strange stories</span></p>
                    </li>
                </ul>
            </div>
            ${!email ? `
                <div class="woohoo-mol-signup">
                    <strong>New to electronic mail?</strong> Get your own MOL address!
                    <div class="signup-row">
                        <label for="new-email-name">Username:</label>
                        <input id="new-email-name" maxlength="24" placeholder="your.name" aria-label="New MOL username">
                        <button class="web-button" id="create-email">Join MOL</button>
                    </div>
                    <small>Your address will end in @${esc(domain)}.</small>
                </div>` : ''}
            <div class="woohoo-page-bottom">WooHoo! World Wide Web Directory &nbsp; | &nbsp; 1995</div>
        </section>
    `, 'home');

    $('#create-email')?.addEventListener('click', async () => {
        const username = $('#new-email-name').value.trim();
        const res = await nui('registerEmail', { username });
        if (res.ok) await refreshSession();
        renderHomeWithNotice(res.message, res.ok ? 'success' : 'error');
    });
}

function renderHomeWithNotice(message, type) {
    renderHome();
    $('.webpage')?.insertAdjacentHTML('afterbegin', setNotice(message, type));
}

function requireEmail() {
    if (state.session?.email) return false;
    const domain = state.session?.domain || state.config?.domain || 'mol.com';
    setWindow('MOL - Create Account', `
        <section class="mol-content mol-login-page">
            <div class="mol-section-title"><strong>Create MOL Account</strong></div>
            <form id="mol-register-form" class="mol-register-form">
                <label for="mol-register-name">Choose a username:</label>
                <div class="mol-register-row">
                    <input id="mol-register-name" name="username" type="text" maxlength="24" minlength="3" autocomplete="off" spellcheck="false" required>
                    <span>@${esc(domain)}</span>
                </div>
                <p id="mol-register-feedback" class="mol-register-feedback" role="status" aria-live="polite"></p>
                <button type="submit" id="mol-register-submit" class="mol-action">Create Account</button>
            </form>
        </section>
    `, 'mail', { url: 'https://mail.mol.com/register' });
    $('#mol-register-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const button = $('#mol-register-submit');
        const feedback = $('#mol-register-feedback');
        button.disabled = true;
        feedback.textContent = '';
        const username = $('#mol-register-name').value.trim();
        const res = await nui('registerEmail', { username });
        if (res?.ok) {
            const session = await refreshSession();
            if (session?.ok && session?.email) {
                state.mailBox = 'inbox';
                await renderMail('Account created.', 'success');
                return;
            }
            feedback.textContent = 'Account created. Reopen MOL Mail to continue.';
        } else {
            feedback.textContent = res?.message || 'Could not create account.';
        }
        button.disabled = false;
    });
    return true;
}

function attachmentBlock(url, label = 'Photo attachment') {
    if (!url) return '';
    const safe = esc(url);
    return `
        <figure class="attachment-preview">
            <img src="${safe}" alt="${esc(label)}" onerror="this.closest('.attachment-preview').classList.add('broken')">
            <figcaption>${esc(label)}</figcaption>
        </figure>
    `;
}

function molToolbar(selected = 'inbox') {
    return `<nav class="mol-toolbar" aria-label="MOL mail navigation">
        <button type="button" class="mol-tool ${selected === 'inbox' ? 'selected' : ''}" data-mailbox="inbox"><img src="./assets/images/mol/inbox.png" alt="">Read Mail</button>
        <button type="button" class="mol-tool ${selected === 'compose' ? 'selected' : ''}" data-compose="1"><img src="./assets/images/mol/write.png" alt="">Write Mail</button>
        <button type="button" class="mol-tool ${selected === 'sent' ? 'selected' : ''}" data-mailbox="sent"><img src="./assets/images/mol/sent.png" alt="">Sent Mail</button>
    </nav>`;
}

function bindMolToolbar() {
    $$('[data-mailbox]').forEach(btn => btn.addEventListener('click', () => {
        state.mailBox = btn.dataset.mailbox;
        renderMail();
    }));
    $$('[data-compose]').forEach(btn => btn.addEventListener('click', () => renderCompose()));
}

async function renderMail(message = '', type = '') {
    if (requireEmail()) return;
    const res = await nui('getMail', { box: state.mailBox });
    const mail = res?.mail || [];
    const box = state.mailBox === 'sent' ? 'sent' : 'inbox';
    const heading = box === 'sent' ? 'Sent Mail' : 'Inbox';

    setWindow('MOL Mail', `
        <section class="mol-content mol-inbox-page">
            ${molToolbar(box)}
            <div class="mol-account">Signed in as: <strong>${esc(state.session?.email || '')}</strong></div>
            ${setNotice(message, type)}
            <div class="mol-section-title"><strong>${heading}</strong><span>${mail.length} message${mail.length === 1 ? '' : 's'}</span></div>
            <table class="mol-mail-list" aria-label="${heading}">
                <thead><tr><th>${box === 'sent' ? 'To' : 'From'}</th><th>Subject</th><th>Date</th><th>Attach.</th></tr></thead>
                <tbody>
                    ${mail.length ? mail.map(m => `
                        <tr class="mail-row ${!m.is_read && box === 'inbox' ? 'unread' : ''}" data-mail-id="${m.id}" tabindex="0" role="button" aria-label="Open message: ${esc(m.subject || '(no subject)')}">
                            <td>${box === 'sent' ? esc(m.recipient_email) : `<span class="mol-sender">${esc(m.sender_name || m.sender_email)}</span><span class="mol-email-small">${esc(m.sender_email)}</span>`}</td>
                            <td class="mol-subject">${esc(m.subject || '(no subject)')}</td>
                            <td>${fmtDate(m.created_at)}</td>
                            <td>${m.attachment_url ? 'Yes' : ''}</td>
                        </tr>
                    `).join('') : `<tr><td colspan="4" class="mol-empty">No messages.</td></tr>`}
                </tbody>
            </table>
        </section>
    `, 'mail', { url: `https://mail.mol.com/${box}` });

    bindMolToolbar();
    $$('[data-mail-id]').forEach(row => {
        const show = () => openMail(mail.find(m => Number(m.id) === Number(row.dataset.mailId)));
        row.addEventListener('click', show);
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    });
}

async function openMail(m) {
    if (!m) return;
    if (state.mailBox === 'inbox' && !m.is_read) {
        await nui('markMailRead', { id: m.id });
        await refreshSession();
    }
    setWindow('MOL Mail', `
        <section class="mol-content mol-reader-page">
            ${molToolbar(state.mailBox)}
            <div class="mol-section-title"><strong>Read Mail</strong></div>
            <table class="mol-message-head">
                <tr><th>From:</th><td>${esc(m.sender_name)} &lt;${esc(m.sender_email)}&gt;</td></tr>
                <tr><th>To:</th><td>${esc(m.recipient_email)}</td></tr>
                <tr><th>Date:</th><td>${fmtDate(m.created_at)}</td></tr>
                <tr><th>Subject:</th><td><strong>${esc(m.subject)}</strong></td></tr>
            </table>
            ${attachmentBlock(m.attachment_url, 'Email photo attachment')}
            <div class="mol-message-body">${esc(m.body || '').replace(/\n/g, '<br>')}</div>
            <div class="mol-reader-actions">
                <button type="button" class="mol-action" id="back-mail">Back to ${state.mailBox === 'sent' ? 'Sent Mail' : 'Inbox'}</button>
                ${state.mailBox === 'inbox' ? `<button type="button" class="mol-action" id="reply-mail">Reply</button>` : ''}
            </div>
        </section>
    `, 'mail', { url: `https://mail.mol.com/message/${esc(m.id)}` });
    bindMolToolbar();
    $('#back-mail')?.addEventListener('click', () => renderMail());
    $('#reply-mail')?.addEventListener('click', () => {
        const subject = String(m.subject || '').trim();
        const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
        renderCompose(m.sender_email, replySubject.slice(0, 80), m);
    });
}

function renderCompose(to = '', subject = '', replyTo = null) {
    setWindow('Compose MOL', `
        <section class="mol-content mol-compose-page">
            ${molToolbar('compose')}
            <div class="mol-section-title"><strong>Write Mail</strong></div>
            <div class="mol-compose-fields">
                <div class="mol-field"><label for="mail-to">To:</label><input id="mail-to" type="text" value="${esc(to)}" placeholder="name@mol.com"></div>
                <div class="mol-field"><label for="mail-subject">Subject:</label><input id="mail-subject" type="text" maxlength="80" value="${esc(subject)}"></div>
                <div class="mol-field"><label for="mail-attachment">Photo URL:</label><input id="mail-attachment" type="text" maxlength="512" placeholder="Optional"></div>
                <div class="mol-field mol-body-field"><label for="mail-body">Message:</label><textarea id="mail-body" maxlength="12000"></textarea></div>
            </div>
            <div class="mol-compose-actions"><button type="button" class="mol-action mol-send" id="send-mail">Send Mail</button><button type="button" class="mol-action" id="cancel-mail">Cancel</button></div>
        </section>
    `, 'compose', { url: 'https://mail.mol.com/compose' });
    bindMolToolbar();
    if (replyTo) {
        const sender = replyTo.sender_name
            ? `${replyTo.sender_name} <${replyTo.sender_email}>`
            : String(replyTo.sender_email || 'Sender');
        const date = fmtDate(replyTo.created_at) || 'Earlier';
        const quoted = String(replyTo.body || '').replace(/\r\n/g, '\n').split('\n')
            .map(line => `> ${line}`).join('\n');
        const body = $('#mail-body');
        body.value = `\n\nOn ${date}, ${sender} wrote:\n${quoted}`;
        body.focus();
        body.setSelectionRange(0, 0);
    }
    $('#cancel-mail').addEventListener('click', () => renderMail());
    $('#send-mail').addEventListener('click', async () => {
        const body = $('#mail-body');
        if (body.value.length > body.maxLength) {
            body.setCustomValidity('Message is too long. Remove older quoted text before sending.');
            body.reportValidity();
            body.setCustomValidity('');
            return;
        }
        const res = await nui('sendEmail', {
            to: $('#mail-to').value,
            subject: $('#mail-subject').value,
            body: $('#mail-body').value,
            attachmentUrl: $('#mail-attachment').value
        });
        if (res?.ok) {
            await refreshSession();
            renderMail(res.message || 'Message sent.', 'success');
        } else {
            let notice = $('#mol-send-feedback');
            if (!notice) {
                $('.mol-compose-actions')?.insertAdjacentHTML('afterend', '<div id="mol-send-feedback" class="notice error" role="status"></div>');
                notice = $('#mol-send-feedback');
            }
            if (notice) notice.textContent = res?.message || 'Message could not be sent. Check the recipient and try again.';
        }
    });
}

function daveslistCategories() {
    return state.config.categories?.daveslist || ['Vehicles', 'Parts', 'Electronics', 'Property', 'Services', 'Wanted', 'Other'];
}

function daveslistDate(value) {
    if (!value) return 'recent';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'recent' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

async function renderDaveslist() {
    state.postApp = 'daveslist';
    const category = state.daveslistCategory;
    const query = state.daveslistQuery;
    const res = await nui('getPosts', { app: 'daveslist', category, query });
    const error = !res?.ok;
    const posts = error ? [] : (res.posts || []);
    state.posts = posts;
    const heading = query ? `search: ${esc(query)}` : category !== 'All' ? esc(category) : 'latest advertisements';
    const categories = daveslistCategories();
    const notice = state.daveslistNotice;
    state.daveslistNotice = '';
    setWindow('daveslist', `
        <div class="dl-page dl-home">
            ${notice ? setNotice(notice, 'success') : ''}
            <div class="dl-banner-ads" aria-label="Advertisement">
                <img src="./assets/images/daveslist/std-contractors-1995.gif" width="468" height="60" alt="STD Contractors advertisement">
            </div>
            <form class="dl-search" id="dl-search-form">
                <label for="dl-query">search:</label>
                <input id="dl-query" type="search" maxlength="100" value="${esc(query)}" autocomplete="off">
                <button class="dl-button" type="submit">search</button>
                ${query ? '<button type="button" class="dl-link" id="dl-clear-search">clear</button>' : ''}
            </form>
            <hr class="dl-rule">
            <h3 class="dl-heading">categories</h3>
            <ul class="dl-categories">
                ${categories.map(c => `<li class="dl-category"><button type="button" class="dl-link ${!query && c === category ? 'dl-active' : ''}" data-dl-category="${esc(c)}">${esc(c.toLowerCase())}</button></li>`).join('')}
            </ul>
            <hr class="dl-rule">
            <div class="dl-section-top">
                <h3 class="dl-heading">${heading}</h3>
                <button type="button" class="dl-link" id="dl-all-ads">${category !== 'All' || query ? 'all ads' : 'refresh'}</button>
            </div>
            <p class="dl-results-note">${error ? 'Ads unavailable.' : `${posts.length} ad${posts.length === 1 ? '' : 's'}`}</p>
            ${posts.length ? `<ul class="dl-ads">${posts.map(p => `<li class="dl-ad-row">
                <span class="dl-ad-date">${esc(daveslistDate(p.created_at))}</span>
                <div class="dl-ad-content"><button type="button" class="dl-link dl-ad-title" data-dl-id="${Number(p.id)}">${esc(p.title)}</button>
                <span class="dl-ad-price">${money(p.price) || 'ask seller'}</span>
                <span class="dl-ad-category">(${esc(p.category || 'other').toLowerCase()})</span>
                <div class="dl-ad-excerpt">${esc(String(p.body || '').replace(/\s+/g, ' ').slice(0, 105))}${String(p.body || '').length > 105 ? '...' : ''}</div></div>
            </li>`).join('')}</ul>` : `<p class="dl-empty">${error ? 'Try again.' : query ? 'No matches.' : 'No ads posted.'}</p>`}
            <p class="dl-post-cta"><button type="button" class="dl-link" id="dl-list-something">post an ad</button></p>
            <div class="dl-bottom-ad" aria-label="Advertisement">
                <img src="./assets/images/daveslist/glory-holes.webp" width="468" height="64" alt="Glory Holes Doughnuts advertisement">
            </div>
        </div>
    `, 'daveslist');
    $('#dl-search-form')?.addEventListener('submit', event => {
        event.preventDefault();
        state.daveslistQuery = $('#dl-query').value.trim();
        state.daveslistCategory = 'All';
        renderDaveslist();
    });
    $$('[data-dl-category]').forEach(button => button.addEventListener('click', () => {
        state.daveslistCategory = button.dataset.dlCategory;
        state.daveslistQuery = '';
        renderDaveslist();
    }));
    const reset = () => {
        state.daveslistCategory = 'All';
        state.daveslistQuery = '';
        renderDaveslist();
    };
    $('#dl-clear-search')?.addEventListener('click', reset);
    $('#dl-all-ads')?.addEventListener('click', reset);
    $('#dl-list-something')?.addEventListener('click', renderDaveslistPostForm);
    $$('[data-dl-id]').forEach(button => button.addEventListener('click', () => {
        const post = posts.find(p => Number(p.id) === Number(button.dataset.dlId));
        if (post) openDaveslistPost(post);
    }));
}

function openDaveslistPost(p) {
    state.postApp = 'daveslist';
    setWindow(`daveslist - ${p.title}`, `
        <div class="dl-page dl-detail">
            <p class="dl-back">&laquo; <button type="button" class="dl-link" id="dl-back-detail">back to classifieds</button></p>
            <hr class="dl-rule">
            <h2>${esc(p.title)}</h2>
            ${dmAdminButton('publicPost', p.id)}
            <p class="dl-detail-price">${money(p.price) || 'price: ask seller'}</p>
            <p class="dl-detail-meta">${esc(p.category || 'other').toLowerCase()} | ${esc(fmtDate(p.created_at))} | ${esc(p.author_name || 'seller')}</p>
            <hr>
            ${p.image_url ? `<img class="dl-detail-photo" src="${esc(p.image_url)}" alt="Listing photo for ${esc(p.title)}">` : ''}
            <div class="dl-detail-description">${esc(p.body).replace(/\n/g, '<br>')}</div>
            <hr>
            <div class="dl-contact"><b>contact the seller</b><p>Email: ${esc(p.contact_email || 'Not provided')}</p>
                ${p.contact_phone ? `<p>Phone: ${esc(p.contact_phone)}</p>` : ''}
                ${p.contact_email ? '<button type="button" class="dl-button" id="dl-email-seller">send a MOL message</button>' : ''}
            </div>
        </div>
    `, 'daveslist', { url: `${siteInfo.daveslist.url}${Number(p.id)}` });
    $('#dl-back-detail')?.addEventListener('click', renderDaveslist);
    $('#dl-email-seller')?.addEventListener('click', () => renderCompose(p.contact_email, `About: ${p.title}`));
}

function renderDaveslistPostForm() {
    if (requireEmail()) return;
    state.postApp = 'daveslist';
    const cats = daveslistCategories();
    const phone = state.session?.phone || '';
    setWindow('daveslist - place an ad', `
        <div class="dl-page dl-post-form">
            <p class="dl-back">&laquo; <button type="button" class="dl-link" id="dl-cancel-top">back to classifieds</button></p>
            <h2 class="dl-heading">post an ad</h2>
            <hr class="dl-rule">
            <form id="dl-ad-form">
                <div class="dl-field"><label for="dl-post-category">category *</label>
                    <select id="dl-post-category" required>${cats.map(c => `<option value="${esc(c)}" ${c === state.daveslistCategory ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
                <div class="dl-field"><label for="dl-post-title">title *</label>
                    <input id="dl-post-title" maxlength="100" required></div>
                <div class="dl-field"><label for="dl-post-price">price</label>
                    <input id="dl-post-price" type="number" min="0" step="1"></div>
                <div class="dl-field"><label for="dl-post-body">description *</label>
                    <textarea id="dl-post-body" maxlength="2200" required rows="7"></textarea></div>
                <div class="dl-field"><label for="dl-post-image">photo URL</label>
                    <input id="dl-post-image" maxlength="512"></div>
                <div class="dl-form-extras">
                    <div class="dl-field"><label for="dl-post-expire">expires after</label>
                        <select id="dl-post-expire"><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></div>
                    <label class="dl-phone"><input id="dl-post-phone" type="checkbox" ${phone ? 'checked' : 'disabled'}>
                        Show phone number ${phone ? `(${esc(phone)})` : '(unavailable)'}</label>
                </div>
                <p class="dl-help">Your MOL email address will be included.</p>
                <div id="dl-post-feedback" role="status"></div>
                <div class="dl-form-actions"><button type="submit" class="dl-button" id="dl-submit-ad">post ad</button>
                    <button type="button" class="dl-link" id="dl-cancel-ad">cancel</button></div>
            </form>
        </div>
    `, 'daveslist', { url: `${siteInfo.daveslist.url}post` });
    $('#dl-cancel-top')?.addEventListener('click', renderDaveslist);
    $('#dl-cancel-ad')?.addEventListener('click', renderDaveslist);
    $('#dl-ad-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const button = $('#dl-submit-ad');
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = 'posting...';
        const res = await nui('createPost', {
            app: 'daveslist',
            category: $('#dl-post-category').value,
            title: $('#dl-post-title').value.trim(),
            price: $('#dl-post-price').value,
            body: $('#dl-post-body').value.trim(),
            imageUrl: $('#dl-post-image').value.trim(),
            includePhone: $('#dl-post-phone').checked,
            expireDays: $('#dl-post-expire').value
        });
        if (res?.ok) {
            state.daveslistCategory = 'All';
            state.daveslistQuery = '';
            state.daveslistNotice = res.message || 'Your ad was submitted.';
            renderDaveslist();
            return;
        }
        $('#dl-post-feedback').textContent = res?.message || 'Could not post your ad. Please try again.';
        button.disabled = false;
        button.textContent = 'post ad';
    });
}

async function renderJobNet() {
    state.postApp = 'jobs';
    const cats = ['All', ...(state.config.categories?.jobs || [])];
    const selected = $('#jobnet-category')?.value || state.jobnetCategory || 'All';
    state.jobnetCategory = cats.includes(selected) ? selected : 'All';
    const res = await nui('getPosts', { app: 'jobs', category: state.jobnetCategory });
    state.posts = res?.posts || [];
    setWindow('JobNet', `
        <section class="jobnet-page jobnet-list-page">
            <div class="jobnet-heading"><strong>Available Positions</strong><span>${state.posts.length} listing${state.posts.length === 1 ? '' : 's'}</span></div>
            <div class="jobnet-filter">
                <label for="jobnet-category">Category:</label>
                <select id="jobnet-category">${cats.map(c => `<option value="${esc(c)}" ${c === state.jobnetCategory ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
                <button type="button" class="jobnet-link" id="jobnet-refresh">Refresh</button>
            </div>
            <hr>
            ${state.posts.length ? `<div class="jobnet-listings">${state.posts.map(p => `
                <article class="jobnet-entry">
                    <button type="button" class="jobnet-link jobnet-entry-title" data-job-id="${Number(p.id)}">${esc(p.title)}</button>
                    ${p.category ? `<span class="jobnet-category">${esc(p.category)}</span>` : ''}
                    <div class="jobnet-entry-meta">${esc(p.author_name || '')} &nbsp; | &nbsp; ${esc(fmtDate(p.created_at))}</div>
                    <p>${esc(String(p.body || '').replace(/\s+/g, ' ').slice(0, 165))}${String(p.body || '').length > 165 ? '...' : ''}</p>
                </article>
            `).join('')}</div>` : '<p class="jobnet-empty">No jobs posted.</p>'}
        </section>
    `, 'jobs');
    $('#jobnet-category')?.addEventListener('change', () => renderJobNet());
    $('#jobnet-refresh')?.addEventListener('click', () => renderJobNet());
    $$('[data-job-id]').forEach(button => button.addEventListener('click', () => {
        const post = state.posts.find(p => Number(p.id) === Number(button.dataset.jobId));
        if (post) openJobNetPost(post);
    }));
}

function openJobNetPost(p) {
    if (!p) return;
    state.postApp = 'jobs';
    setWindow('JobNet - ' + p.title, `
        <section class="jobnet-page jobnet-details">
            <p class="jobnet-back"><button type="button" class="jobnet-link" id="jobnet-back">&laquo; Back to job listings</button></p>
            <h2>${esc(p.title)}</h2>
            ${dmAdminButton('publicPost', p.id)}
            ${p.category ? `<p class="jobnet-category">${esc(p.category)}</p>` : ''}
            <hr>
            ${p.image_url ? `<img class="jobnet-post-photo" src="${esc(p.image_url)}" alt="Job advertisement image">` : ''}
            <dl class="jobnet-facts">
                <dt>Posted by:</dt><dd>${esc(p.author_name || '')}</dd>
                <dt>Posted:</dt><dd>${esc(fmtDate(p.created_at))}</dd>
                <dt>Email:</dt><dd>${esc(p.contact_email || 'Not provided')}</dd>
                ${p.contact_phone ? `<dt>Phone:</dt><dd>${esc(p.contact_phone)}</dd>` : ''}
            </dl>
            <h3>Description</h3>
            <div class="jobnet-description">${esc(p.body || '').replace(/\n/g, '<br>')}</div>
            <hr>
            ${p.contact_email ? '<button type="button" class="jobnet-basic-button" id="jobnet-email">Email Poster</button>' : ''}
        </section>
    `, 'jobs', { url: `${siteInfo.jobs.url}/${Number(p.id)}` });
    $('#jobnet-back')?.addEventListener('click', () => renderJobNet());
    $('#jobnet-email')?.addEventListener('click', () => renderCompose(p.contact_email, `About: ${p.title}`));
}

function renderJobNetPostForm() {
    if (requireEmail()) return;
    state.postApp = 'jobs';
    const cats = state.config.categories?.jobs || [];
    const phone = state.session?.phone || '';
    setWindow('JobNet - Post a Job', `
        <section class="jobnet-page jobnet-form-page">
            <h2>Post a Job</h2>
            <hr>
            <div class="jobnet-form-actions"><button type="submit" form="jobnet-post-form" class="jobnet-basic-button" id="jobnet-publish">Publish Job</button><button type="button" class="jobnet-basic-button" id="jobnet-cancel">Cancel</button></div>
            <p class="jobnet-feedback" id="jobnet-feedback" role="status"></p>
            <form id="jobnet-post-form">
                <div class="jobnet-field"><label for="jobnet-post-category">Category:</label><select id="jobnet-post-category">${cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>
                <div class="jobnet-field"><label for="jobnet-post-title">Job Title:</label><input id="jobnet-post-title" maxlength="100" required></div>
                <div class="jobnet-field"><label for="jobnet-post-body">Description:</label><textarea id="jobnet-post-body" maxlength="2200" required></textarea></div>
                <div class="jobnet-field"><label for="jobnet-post-image">Photo URL (optional):</label><input id="jobnet-post-image" maxlength="512"></div>
                <div class="jobnet-field"><label for="jobnet-post-expire">Expires in:</label><select id="jobnet-post-expire"><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></div>
                <div class="jobnet-field"><span>Phone:</span><label class="jobnet-check"><input id="jobnet-post-phone" type="checkbox" ${phone ? 'checked' : 'disabled'}> Include my phone number${phone ? ` (${esc(phone)})` : ''}</label></div>
            </form>
        </section>
    `, 'jobs', { url: `${siteInfo.jobs.url}/new` });
    $('#jobnet-cancel')?.addEventListener('click', () => renderJobNet());
    $('#jobnet-post-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = $('#jobnet-publish');
        if (submit.disabled) return;
        submit.disabled = true;
        const res = await nui('createPost', {
            app: 'jobs',
            category: $('#jobnet-post-category').value,
            title: $('#jobnet-post-title').value.trim(),
            body: $('#jobnet-post-body').value.trim(),
            imageUrl: $('#jobnet-post-image').value.trim(),
            includePhone: $('#jobnet-post-phone').checked,
            expireDays: $('#jobnet-post-expire').value
        });
        if (res?.ok) { state.jobnetCategory = 'All'; renderJobNet(); return; }
        $('#jobnet-feedback').textContent = res?.message || 'Could not post the job.';
        submit.disabled = false;
    });
}

async function renderPosts(app = 'daveslist') {
    if (app === 'jobs') return renderJobNet();
    if (app === 'daveslist') return renderDaveslist();
    state.postApp = app;
    const cats = ['All', ...((state.config.categories?.[app]) || [])];
    const selected = $('#category-filter')?.value || 'All';
    const res = await nui('getPosts', { app, category: selected });
    state.posts = res?.posts || [];
    const title = app === 'jobs' ? 'JobNet' : 'daveslist classifieds';
    const siteKey = app === 'jobs' ? 'jobs' : 'daveslist';

    setWindow(title, `
        <section class="w95-page classifieds-page ${siteKey}-directory">
            <div class="directory-toolbar">
                <label for="category-filter">Category</label>
                <select id="category-filter">${cats.map(c => `<option ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
                <button class="web-button" id="refresh-posts">Refresh</button>
                <button class="web-button primary" id="new-post">${app === 'jobs' ? 'Post Job' : 'Post Ad'}</button>
            </div>
            <table class="listing-table">
                <thead>
                    <tr>
                        <th class="thumb-col">Photo</th>
                        <th>Listing</th>
                        <th>Contact</th>
                        <th>${app === 'jobs' ? 'Posted' : 'Price'}</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.posts.length ? state.posts.map(p => `
                        <tr class="listing-row" data-post-id="${p.id}">
                            <td class="thumb-cell">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}">` : '<span class="no-thumb">No Photo</span>'}</td>
                            <td>
                                <div class="listing-title-row"><strong>${esc(p.title)}</strong>${p.category ? `<span class="tag">${esc(p.category)}</span>` : ''}</div>
                                <div class="table-preview">${esc(String(p.body || '').slice(0, 120))}${String(p.body || '').length > 120 ? '...' : ''}</div>
                                <div class="web-meta">Posted by ${esc(p.author_name)} · ${fmtDate(p.created_at)}</div>
                            </td>
                            <td class="contact-cell">${esc(p.contact_email || 'No email')}<br>${p.contact_phone ? esc(p.contact_phone) : ''}</td>
                            <td>${app === 'jobs' ? fmtDate(p.created_at).split(',')[0] : (p.price ? `<span class="price">${money(p.price)}</span>` : '-')}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="4" class="table-empty">Nothing posted yet.</td></tr>'}
                </tbody>
            </table>
        </section>
    `, siteKey);

    $('#category-filter')?.addEventListener('change', () => renderPosts(app));
    $('#refresh-posts')?.addEventListener('click', () => renderPosts(app));
    $('#new-post')?.addEventListener('click', () => renderPostForm(app));
    $$('[data-post-id]').forEach(card => card.addEventListener('click', () => openPost(state.posts.find(p => Number(p.id) === Number(card.dataset.postId)))));
}

function openPost(p) {
    if (!p) return;
    if (state.postApp === 'jobs') return openJobNetPost(p);
    if (state.postApp === 'daveslist') return openDaveslistPost(p);
    const siteKey = state.postApp === 'jobs' ? 'jobs' : 'daveslist';
    setWindow(state.postApp === 'jobs' ? 'JobNet Listing' : 'daveslist listing', `
        <section class="w95-page listing-view-page">
            <div class="listing-view-card">
                <div class="listing-view-media">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}">` : '<div class="image-placeholder">No Photo Available</div>'}</div>
                <div class="listing-view-copy">
                    <div class="listing-title-row"><strong>${esc(p.title)}</strong>${p.category ? `<span class="tag">${esc(p.category)}</span>` : ''}${p.price ? `<span class="price">${money(p.price)}</span>` : ''}</div>
                    <table class="detail-table">
                        <tr><th>Posted By</th><td>${esc(p.author_name)}</td></tr>
                        <tr><th>Date</th><td>${fmtDate(p.created_at)}</td></tr>
                        <tr><th>Email</th><td>${esc(p.contact_email || 'No email')}</td></tr>
                        <tr><th>Phone</th><td>${esc(p.contact_phone || 'Not provided')}</td></tr>
                    </table>
                    <div class="message-body-copy">${esc(p.body).replace(/\n/g, '<br>')}</div>
                </div>
            </div>
            <div class="mail-toolbar reader-actions">
                <button class="web-button" id="back-posts">Return to Listings</button>
                ${p.contact_email ? `<button class="web-button primary" id="email-poster">Email Poster</button>` : ''}
            </div>
        </section>
    `, siteKey, { url: `${siteInfo[siteKey].url}/${esc(p.id)}` });
    $('#back-posts')?.addEventListener('click', () => renderPosts(state.postApp));
    $('#email-poster')?.addEventListener('click', () => renderCompose(p.contact_email, `About: ${p.title}`));
}

function renderPostForm(app = 'daveslist') {
    if (app === 'jobs') return renderJobNetPostForm();
    if (app === 'daveslist') return renderDaveslistPostForm();
    if (requireEmail()) return;
    const cats = (state.config.categories?.[app]) || [];
    const siteKey = app === 'jobs' ? 'jobs' : 'daveslist';
    const phone = state.session?.phone || '';
    setWindow(app === 'jobs' ? 'Post Job' : 'Post an Ad', `
        <section class="w95-page post-form-page">
            <div class="compose-shell">
                <div class="compose-toolbar"><button class="web-button primary" id="publish-post">Publish</button><button class="web-button" id="cancel-post">Cancel</button></div>
                <table class="compose-table post-form-table">
                    <tr><th>Category</th><td><select id="post-category">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></td></tr>
                    <tr><th>Title</th><td><input id="post-title" maxlength="100"></td></tr>
                    ${app === 'daveslist' ? '<tr><th>Price</th><td><input id="post-price" type="number" min="0" step="1"></td></tr>' : ''}
                    <tr><th>Photo URL</th><td><input id="post-image" maxlength="512" placeholder="https://example.com/photo.jpg"></td></tr>
                    <tr><th>Expires In</th><td><select id="post-expire"><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></td></tr>
                    <tr><th>Phone</th><td><label class="check-row"><input id="post-phone" type="checkbox" ${phone ? 'checked' : 'disabled'}> Auto add my phone number ${phone ? `(${esc(phone)})` : '(no number detected)'}</label></td></tr>
                    <tr><th>Description</th><td><textarea id="post-body" maxlength="2200"></textarea></td></tr>
                </table>
            </div>
        </section>
    `, siteKey, { url: `${siteInfo[siteKey].url}/new` });
    $('#cancel-post').addEventListener('click', () => renderPosts(app));
    $('#publish-post').addEventListener('click', async () => {
        const res = await nui('createPost', {
            app,
            category: $('#post-category').value,
            title: $('#post-title').value,
            price: $('#post-price')?.value,
            body: $('#post-body').value,
            imageUrl: $('#post-image').value,
            includePhone: $('#post-phone')?.checked,
            expireDays: $('#post-expire').value
        });
        if (res.ok) renderPosts(app);
        else $('.webpage')?.insertAdjacentHTML('afterbegin', setNotice(res.message || 'Could not publish post.', 'error'));
    });
}


function internetConnected() {
    return state.theme.requireDialup === false || state.dialup.connected === true;
}

async function refreshDialupStatus() {
    const status = await nui('dialupStatus');
    if (status?.ok) {
        state.dialup.required = status.required !== false;
        state.dialup.connected = status.connected === true;
    }
    return status;
}

function renderOfflinePage(route = 'home') {
    const url = siteInfo[route]?.url || siteInfo.home.url;
    setWindow('Internet Explorer', `<div class="dialup-offline">
        <h3>The page cannot be displayed</h3>
        <p>You are not connected to the Internet.</p>
        <hr>
        <button type="button" id="offline-connect">Connect to the Internet</button>
    </div>`, 'home', { offline: true, url });
    $('#offline-connect')?.addEventListener('click', () => openApp('network'));
}

let dialupAttempt = 0;
let dialupFallbackTimer = null;

function clearDialupTimer() {
    if (dialupFallbackTimer !== null) clearTimeout(dialupFallbackTimer);
    dialupFallbackTimer = null;
}

function cancelDialup() {
    const wasConnecting = state.dialup.connecting;
    dialupAttempt++;
    state.dialup.connecting = false;
    clearDialupTimer();
    const audio = $('#dialup-audio');
    if (audio) {
        audio.onended = null;
        audio.pause();
        audio.currentTime = 0;
    }
    if (wasConnecting) nui('dialupCancel');
}

async function beginDialup() {
    if (state.dialup.connecting || internetConnected()) return;
    const id = ++dialupAttempt;
    state.dialup.connecting = true;
    const showStatus = text => { if ($('#dialup-status')) $('#dialup-status').textContent = text; };
    showStatus('Dialling...');
    if ($('#dialup-connect')) $('#dialup-connect').disabled = true;
    if ($('#dialup-cancel')) $('#dialup-cancel').hidden = false;

    const started = await nui('dialupBegin');
    if (id !== dialupAttempt) return;
    if (!started?.ok) {
        state.dialup.connecting = false;
        showStatus(started?.message || 'Connection failed.');
        if ($('#dialup-connect')) $('#dialup-connect').disabled = false;
        if ($('#dialup-cancel')) $('#dialup-cancel').hidden = true;
        return;
    }
    if (started.connected) {
        state.dialup.connecting = false;
        state.dialup.connected = true;
        renderAbout();
        return;
    }

    const audio = $('#dialup-audio');
    if (!audio) {
        cancelDialup();
        showStatus('Modem audio unavailable.');
        if ($('#dialup-connect')) $('#dialup-connect').disabled = false;
        if ($('#dialup-cancel')) $('#dialup-cancel').hidden = true;
        return;
    }

    let finished = false;
    const finish = async () => {
        if (finished || id !== dialupAttempt) return;
        finished = true;
        clearDialupTimer();
        audio.onended = null;
        audio.pause();
        showStatus('Connecting...');
        const result = await nui('dialupComplete');
        if (id !== dialupAttempt) return;
        state.dialup.connecting = false;
        if (result?.ok && result.connected) {
            state.dialup.connected = true;
            renderAbout();
        } else {
            showStatus(result?.message || 'Connection failed.');
            if ($('#dialup-connect')) $('#dialup-connect').disabled = false;
            if ($('#dialup-cancel')) $('#dialup-cancel').hidden = true;
        }
    };

    audio.onended = finish;
    audio.currentTime = 0;
    audio.volume = 0.85;
    try {
        await audio.play();
        if (id !== dialupAttempt) return;
        // FiveM's audio element can miss 'ended'. Complete after the recording's duration too.
        const durationMs = Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration * 1000 : 11400;
        dialupFallbackTimer = setTimeout(finish, Math.max(9000, durationMs) + 350);
        if (audio.ended) finish();
    } catch (_) {
        if (id !== dialupAttempt) return;
        cancelDialup();
        showStatus('Could not play modem audio.');
        if ($('#dialup-connect')) $('#dialup-connect').disabled = false;
        if ($('#dialup-cancel')) $('#dialup-cancel').hidden = true;
    }
}

function renderAbout() {
    const connected = internetConnected();
    state.maximized = false;
    $('#main-window').classList.remove('maximized');
    $('#maximize-app').textContent = '□';
    setWindow('Dial-Up Networking', `<div class="dialup-window native-shell">
        <div class="dialup-dialog">
            <div class="dialup-title"><img src="./assets/icons/custom-network.png" alt=""><strong>Public Access Network</strong></div>
            <fieldset><legend>Connection</legend>
                <p>Status: <span id="dialup-status">${connected ? 'Connected successfully.' : state.dialup.connecting ? 'Dialling...' : 'Disconnected'}</span></p>
                <p>Modem: 56k Dial-Up</p>
            </fieldset>
            <div class="dialup-actions">
                ${connected ? '' : `<button id="dialup-connect" type="button" ${state.dialup.connecting ? 'disabled' : ''}>Connect</button>`}
                <button id="dialup-close" type="button">Close</button>
                ${connected ? '' : `<button id="dialup-cancel" type="button" ${state.dialup.connecting ? '' : 'hidden'}>Cancel</button>`}
            </div>
        </div>
    </div>`, 'home', { native: true, dialup: true });
    $('#dialup-connect')?.addEventListener('click', beginDialup);
    $('#dialup-close')?.addEventListener('click', closeCurrentApp);
    $('#dialup-cancel')?.addEventListener('click', () => { cancelDialup(); renderAbout(); });
}

async function openPoliceMdt() {
    const res = await nui('openPoliceMDT');
    if (!res?.ok) {
        renderHomeWithNotice(res?.message || 'Police MDT is unavailable.', 'error');
    }
}

function closeControlPanel() {
    $('#control-panel').classList.remove('show');
}

function showAdminDialog(title, heading, message, warning = true) {
    $('#admin-dialog-title').textContent = title;
    $('#admin-dialog-heading').textContent = heading;
    $('#admin-dialog-message').textContent = message;
    $('#admin-dialog-icon').textContent = warning ? '⚠' : 'ⓘ';
    $('#admin-dialog').classList.add('show');
}

const themePresets = ['original', 'gradient', 'midnight'];

function applyTheme(theme) {
    const preset = themePresets.includes(theme?.preset) ? theme.preset : 'original';
    state.theme = { preset, requireDialup: theme?.requireDialup !== false };
    document.body.dataset.cafeTheme = preset;
    if (!$('#admin-settings').classList.contains('show')) $('#admin-theme-preset').value = preset;
    state.theme.policeMdtEnabled = theme?.policeMdtEnabled !== false;
    if (!$('#admin-settings').classList.contains('show')) $('#admin-police-mdt').checked = state.theme.policeMdtEnabled;
    if (!$('#admin-settings').classList.contains('show')) $('#admin-disable-dialup').checked = !state.theme.requireDialup;
    if (state.config.policeMdt) state.config.policeMdt.enabled = state.theme.policeMdtEnabled;
    updatePoliceMdtUi();
}

function previewAdminTheme() {
    $('#admin-theme-preview').dataset.cafeTheme = $('#admin-theme-preset').value;
}

function showAdminTab(tab = 'appearance') {
    const mdt = tab === 'mdt';
    $('#admin-appearance-section').hidden = tab !== 'appearance';
    $('#admin-internet-section').hidden = tab !== 'internet';
    $('#admin-mdt-section').hidden = !mdt;
    $('#admin-darkmarket-section').hidden = tab !== 'darkmarket';
    $('#admin-tab-darkmarket').classList.toggle('selected', tab === 'darkmarket');
    $('.admin-settings-actions').hidden = tab === 'darkmarket';
    $('#admin-reset-theme').hidden = tab !== 'appearance';
    $('#admin-tab-appearance').classList.toggle('selected', tab === 'appearance');
    $('#admin-tab-internet').classList.toggle('selected', tab === 'internet');
    $('#admin-tab-mdt').classList.toggle('selected', mdt);
}

function openAdminSettings(tab = 'appearance') {
    $('#admin-dialog').classList.remove('show');
    $('#admin-theme-preset').value = state.theme.preset;
    $('#admin-police-mdt').checked = state.theme.policeMdtEnabled !== false;
    $('#admin-disable-dialup').checked = state.theme.requireDialup === false;
    dmAdminRefresh();
    $('#admin-save-status').textContent = '';
    previewAdminTheme();
    showAdminTab(tab);
    $('#admin-settings').classList.add('show');
}

function closeAdminSettings() {
    $('#admin-settings').classList.remove('show');
    $('#admin-save-status').textContent = '';
}

async function saveAdminTheme() {
    const button = $('#admin-apply-theme');
    if (button.disabled) return;
    button.disabled = true;
    $('#admin-save-status').textContent = 'Applying settings...';
    try {
        const result = await nui('saveComputerTheme', { preset: $('#admin-theme-preset').value, policeMdtEnabled: $('#admin-police-mdt').checked, requireDialup: !$('#admin-disable-dialup').checked });
        if (result?.ok === true) {
            $('#admin-save-status').textContent = 'Saved. All connected computers have been updated.';
        } else {
            $('#admin-save-status').textContent = result?.message || 'Unable to save settings.';
        }
    } finally {
        button.disabled = false;
    }
}

async function checkAdministration(tab = 'appearance') {
    const button = $('#open-administration');
    if (button.disabled) return;
    button.disabled = true;
    try {
        const result = await nui('checkAdministration');
        if (result?.ok !== true) {
            showAdminDialog('WinDos Administration', 'Connection Error', result?.message || 'Unable to verify administrator access.', false);
        } else if (result.allowed === true) {
            openAdminSettings(tab);
        } else {
            showAdminDialog('WinDos Security', 'Access Denied', 'You do not have permission to access Administration. Please log on with administrator privileges.');
        }
    } finally {
        button.disabled = false;
    }
}

function renderMyComputer() {
    setWindow('My Computer', `
        <div class="explorer-shell native-shell">
            <div class="explorer-menu">File　Edit　View　Go　Favorites　Help</div>

            <div class="explorer-locationbar"><span>Address</span><div class="explorer-location">My Computer</div></div>
            <div class="explorer-workspace">
                <aside class="explorer-sidebar">
                    <section class="sidebar-pane">
                        <h4>System</h4>
                        <ul>
                            <li>Desktop</li>
                            <li>My Computer</li>
                            <li>Network Neighborhood</li>
                        </ul>
                    </section>
                    <section class="sidebar-pane">
                        <h4>Selected Item</h4>
                        <p>Choose an item to open a WinDos application or location.</p>
                    </section>
                </aside>
                <div class="explorer-content">
                    <div class="explorer-grid explorer-real-grid">
                        <button data-explorer="browser"><img src="./assets/icons/custom-explorer.png" alt=""><span>Internet Explorer</span></button>
                        <button data-explorer="network"><img src="./assets/icons/custom-network.png" alt=""><span>Network Neighborhood</span></button>
                        <button data-explorer="control-panel"><img src="./assets/icons/custom-settings_controlpanel.png" alt=""><span>Control Panel</span></button>
                        <button data-explorer="recycle-bin"><img src="./assets/icons/custom-recycle.png" alt=""><span>Recycle Bin</span></button>
                    </div>
                </div>
            </div>
            <div class="explorer-status">4 object(s)　　WinDos 95 · San Andreas Network</div>
        </div>
    `, 'home', { native: true });
    $$('#window-body [data-explorer]').forEach(button => button.addEventListener('click', () => openApp(button.dataset.explorer)));
}

function renderRecycleBin() {
    setWindow('Recycle Bin', '<div class="explorer-shell native-shell"><div class="explorer-menu">File　Edit　View　Go　Help</div><div class="explorer-locationbar"><span>Address</span><div class="explorer-location">Recycle Bin</div></div><div class="explorer-empty">Recycle Bin is empty.</div><div class="explorer-status">0 object(s)</div></div>', 'home', { native: true });
}

function closeStartMenu() {
    $('#start-menu').hidden = true;
    $('#programs-menu').hidden = true;
    $('#start-programs').setAttribute('aria-expanded', 'false');
    $('#start-button').classList.remove('pressed');
}

function toggleStartMenu() {
    const menu = $('#start-menu');
    const wasOpen = !menu.hidden;
    closeStartMenu();
    if (!wasOpen) { menu.hidden = false; $('#start-button').classList.add('pressed'); }
}

function minimizeMainWindow() {
    $('#main-window').classList.remove('show');
    $('#main-window').classList.add('minimized');
    $('#task-label').classList.remove('active');
}

function toggleMaximizeMainWindow() {
    const win = $('#main-window');
    state.maximized = !state.maximized;
    win.classList.toggle('maximized', state.maximized);
    $('#maximize-app').textContent = state.maximized ? '❐' : '□';
}

function openApp(app) {
    if (state.dialup.connecting && app !== 'network') cancelDialup();
    if (!['browser', 'home', 'mail', 'daveslist', 'jobs', 'post'].includes(app)) { cancelBrowserLoad(); pulseWindosBusy(420); }
    closeStartMenu();
    state.currentApp = app;
    if (app === 'search' || app === 'darkmarket' || publicGatewaySites[app]) return navigateBrowser(app);
    if (app === 'my-computer') return renderMyComputer();
    if (app === 'recycle-bin') return renderRecycleBin();
    if (app === 'browser' || app === 'home' || app === 'mail' || app === 'daveslist' || app === 'jobs') return navigateBrowser(app);
    if (app === 'network') return renderAbout();
    if (app === 'control-panel') { $('#control-panel').classList.add('show'); return; }
    if (app === 'police-mdt') return openPoliceMdt();

    if (app === 'post') return navigateBrowser('post');
    if (app === 'about') return renderAbout();
    renderHome();
}

let bootGeneration = 0;
async function openTerminal(config) {
    const generation = ++bootGeneration;
    closeControlPanel();
    closeStartMenu();
    $('#admin-dialog').classList.remove('show');
    closeAdminSettings();
    state.config = config || {};
    state.adminMode = false;
    dmHandle = ''; // require a fresh private-network sign-in on this computer
    if (state.config.policeMdt) state.config.policeMdt.enabled = state.theme.policeMdtEnabled !== false;
    closeCurrentApp();
    applyScreenProfile(state.config.screen);
    updatePoliceMdtUi();
    setWindosActive(true);
    $('#terminal').classList.remove('hidden');
    $('#terminal').classList.add('booting');
    $('#boot').classList.add('active');
    $('#desktop').classList.remove('active');
    if (state.config.wallpaperLogo === false) $('#wallpaper-logo')?.classList.add('hidden');

    const audio = $('#boot-audio');
    if (state.config.bootSound && audio) {
        audio.currentTime = 0;
        audio.volume = 0.36;
        audio.play().catch(() => {});
    }

    await refreshSession();
    await refreshDialupStatus();
    if (generation !== bootGeneration) return;
    setTimeout(() => {
        if (generation !== bootGeneration) return;
        $('#boot').classList.remove('active');
        $('#terminal').classList.remove('booting');
        $('#desktop').classList.add('active');
        state.browserHistory = [];
        state.browserIndex = -1;
        closeCurrentApp();
        $('#main-window').classList.remove('show');
        $('#task-label').textContent = 'Desktop';
    }, Number(state.config.bootTime || 1800));
}

function closeTerminal() {
    if (state.dialup.connecting) cancelDialup();
    cancelBrowserLoad();
    resetWindosBusy();
    $('#boot-audio')?.pause();
    bootGeneration++;
    applyScreenProfile();
    setWindosActive(false);
    $('#terminal').classList.add('hidden');
    $('#terminal').classList.remove('booting');
    $('#desktop').classList.remove('active');
    $('#boot').classList.remove('active');
    $('#main-window').classList.remove('show');
    closeControlPanel();
    closeStartMenu();
    closeAdminSettings();
    state.adminMode = false;
    dmHandle = '';
    dmPendingProfile = '';
    nui('darkmarket', {action:'logout'});
    $('#admin-dialog').classList.remove('show');
}

function suspendTerminal() {
    resetWindosBusy();
    setWindosActive(false);
    $('#terminal').classList.add('hidden');
}

function resumeTerminal(data = {}) {
    if (data.policeMdt) state.config.policeMdt = data.policeMdt;
    updatePoliceMdtUi();
    setWindosActive(true);
    $('#terminal').classList.remove('hidden');
    $('#terminal').classList.remove('booting');
    $('#boot').classList.remove('active');
    $('#desktop').classList.add('active');
}

setWindosActive(false);

window.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.action === 'themeUpdated') {
        applyTheme(data.theme);
        if (!$('#terminal').classList.contains('hidden')) {
            refreshDialupStatus().then(() => {
                if (internetConnected() && state.dialup.connecting) cancelDialup();
                if ($('#main-window').classList.contains('show') && $('.browser-frame')) navigateBrowser(state.browserCurrent, true);
                else if ($('#main-window').classList.contains('show') && state.currentApp === 'network') renderAbout();
            });
        }
    }
    if (data.action === 'open') openTerminal(data.config);
    if (data.action === 'close') closeTerminal();
    if (data.action === 'suspend') suspendTerminal();
    if (data.action === 'resume') resumeTerminal(data);
});

window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('#main-window').classList.contains('show')) {
        closeCurrentApp();
    } else {
        nui('close');
    }
});

$('#close-control-panel').addEventListener('click', closeControlPanel);
$('#open-administration').addEventListener('click', () => checkAdministration('appearance'));
$('#open-mdt-settings').addEventListener('click', () => checkAdministration('mdt'));
$('#open-admin-mode').addEventListener('click', () => checkAdministration('darkmarket'));
// FiveM's NUI uses invokeNative for external URLs. Copy fallback stays available.
const mdtDiscordUrl = 'https://discord.gg/TFE4a3D7m4';
$('#mdt-discord-link')?.addEventListener('click', async event => {
    event.preventDefault();
    if (typeof window.invokeNative === 'function') {
        try {
            window.invokeNative('openUrl', mdtDiscordUrl);
            return;
        } catch (error) { console.warn('External browser unavailable', error); }
    }
    try {
        await navigator.clipboard.writeText(mdtDiscordUrl);
        $('#mdt-discord-feedback').textContent = 'Discord invite copied. Paste it into your browser.';
    } catch (_) {
        $('#mdt-discord-feedback').textContent = `Open this address in your browser: ${mdtDiscordUrl}`;
    }
});

$('#admin-tab-appearance').addEventListener('click', () => showAdminTab('appearance'));
$('#admin-tab-internet').addEventListener('click', () => showAdminTab('internet'));
$('#admin-tab-mdt').addEventListener('click', () => showAdminTab('mdt'));
$('#admin-tab-darkmarket').addEventListener('click', () => showAdminTab('darkmarket'));
$('#admin-mode-toggle').addEventListener('change', () => dmAdminToggle());
$('#admin-save-darkmarket').addEventListener('click', () => dmAdminSave());
$('#admin-dialog-ok').addEventListener('click', () => $('#admin-dialog').classList.remove('show'));
$('#admin-dialog-close').addEventListener('click', () => $('#admin-dialog').classList.remove('show'));
$('#close-app').addEventListener('click', closeCurrentApp);
$$('.desktop-icon').forEach(btn => btn.addEventListener('click', () => openApp(btn.dataset.app)));
$('#start-button').addEventListener('click', toggleStartMenu);
$('#start-programs').addEventListener('click', () => {
    const menu = $('#programs-menu');
    menu.hidden = !menu.hidden;
    $('#start-programs').setAttribute('aria-expanded', String(!menu.hidden));
});
$$('[data-start-app]').forEach(button => button.addEventListener('click', () => openApp(button.dataset.startApp)));
$('#start-shutdown').addEventListener('click', () => { closeStartMenu(); nui('close'); });
$('#minimize-app').addEventListener('click', minimizeMainWindow);
$('#maximize-app').addEventListener('click', toggleMaximizeMainWindow);
$('#task-label').addEventListener('click', () => {
    const win = $('#main-window');
    if (win.classList.contains('show')) minimizeMainWindow();
    else if (win.classList.contains('minimized')) { win.classList.remove('minimized'); win.classList.add('show'); $('#task-label').classList.add('active'); }
    else openApp('browser');
});
document.addEventListener('click', event => {
    const inspect = event.target.closest('[data-admin-kind][data-admin-id]');
    if (inspect && !inspect.closest('.dm-page')) { event.preventDefault(); dmInspect(inspect.dataset.adminKind, Number(inspect.dataset.adminId), inspect); }
    // Visual feedback for page/subwindow actions not covered by navigation or NUI.
    const action = event.target.closest('[data-compose], [data-mailbox], [data-mail-id], [data-post-id], #new-post, #cancel-post, #back-posts, #back-mail, #reply-mail, #cancel-mail, #open-administration, #open-mdt-settings, #open-control-panel, [data-explorer]');
    if (action && !action.disabled && $('#terminal').classList.contains('hidden') === false) pulseWindosBusy(440);
    if (!event.target.closest('#start-menu, #start-button')) closeStartMenu();
});

setInterval(() => {
    $('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);

$('#admin-theme-preset').addEventListener('change', previewAdminTheme);
$('#admin-apply-theme').addEventListener('click', saveAdminTheme);
$('#admin-cancel-theme').addEventListener('click', closeAdminSettings);
$('#close-admin-settings').addEventListener('click', closeAdminSettings);
$('#admin-reset-theme').addEventListener('click', () => { $('#admin-theme-preset').value = 'original'; previewAdminTheme(); });
