// DarkMarket pages live inside the existing Internet Explorer window.
let dmView = 0;
let dmHandle = '';
let dmPendingProfile = '';
let dmBoard = 0;
let dmTopic = 0;
let dmKind = '';
let dmQuery = '';
const dmUrl = 'http://www.darkmarket.net/';
const dmText = value => esc(value).replace(/\n/g, '<br>');
const dmDate = value => esc(fmtDate(value));
const dmAdminButton = (kind,id) => state.adminMode ? `<button class="dm-admin-inspect" data-admin-kind="${kind}" data-admin-id="${Number(id)}">[ inspect ]</button>` : '';

async function dmCall(action, data = {}) { return nui('darkmarket', {action, ...data}); }
function dmOpenTruthProfile() {
    dmPendingProfile = 'thetruth';
    navigateBrowser('darkmarket');
}
function dmAfterSignIn() {
    const target = dmPendingProfile;
    dmPendingProfile = '';
    return target ? dmNavigate('profile', target) : dmNavigate('home');
}
function dmShell(content, title = 'DarkMarket') {
    setWindow(title, `<section class="dm-page">
        <header class="dm-masthead">
            <img class="dm-logo-art" src="./assets/images/darkmarket/darkmarket-logo.png" alt="DarkMarket">
            <div class="dm-subtitle"><span>Private Network</span><span>Est. 1995</span></div>
        </header>
        ${dmHandle ? `<nav class="dm-nav"><button data-dm-go="home">home</button> <button data-dm-go="forums">boards</button> <button data-dm-go="ads">classifieds</button> <button data-dm-go="messages">messages</button> <button data-dm-go="members">members</button></nav>
        <div class="dm-userline">Handle: <strong>${esc(dmHandle)}</strong> <button data-dm-logout>log out</button></div>` : ''}
        <main class="dm-content">${content}</main>
        <footer class="dm-foot">DarkMarket Private Network &copy; 1995</footer>
    </section>`, 'darkmarket', {url:dmUrl});
    document.querySelectorAll('[data-dm-go]').forEach(el=>{el.dataset.dmWired='1';el.addEventListener('click',()=>dmNavigate(el.dataset.dmGo));});
    document.querySelector('[data-dm-logout]')?.addEventListener('click',async()=>{await dmCall('logout');dmHandle='';dmNavigate('entry');});
    document.querySelectorAll('.dm-admin-inspect').forEach(el=>{el.dataset.dmWired='1';el.addEventListener('click',()=>dmInspect(el.dataset.adminKind, Number(el.dataset.adminId),el));});
}
function dmError(res) { return `<div class="dm-error">${esc(res?.message || 'Connection unavailable.')}</div>`; }
function dmBusy() { dmShell('<p class="dm-prompt">Loading...</p>'); }
async function renderDarkMarket() {
    const request=++dmView;
    dmBusy();
    const result=await dmCall('status');
    if(request!==dmView || state.browserCurrent!=='darkmarket')return;
    if(!result?.ok) {dmHandle='';dmShell(`<h3>Access denied</h3>${dmError(result)}<p>This page is unavailable.</p>`);return;}
    if(result.loggedIn){dmHandle=result.handle;return dmAfterSignIn();}
    dmHandle='';
    dmEntry(!!result.registered, '', result.registeredHandle || '');
}
function dmEntry(registered, message='', knownHandle='') {
    dmShell(`<div class="dm-entry-note"><b>Members</b><span>Boards / Classifieds / Messages</span></div>
        ${message ? `<p class="dm-error" role="alert">${esc(message)}</p>` : ''}
        <div class="dm-login-layout">
            <section class="dm-auth-panel">
                <h2>Member login</h2>
                <form id="dm-login-form">
                    <label>Handle<input name="handle" value="${esc(knownHandle)}" maxlength="24" minlength="3" required autocomplete="off" spellcheck="false"></label>
                    <label>Password<input name="password" type="password" minlength="8" maxlength="72" required autocomplete="off"></label>
                    <button type="submit">Log in</button>
                </form>
                <p><button type="button" class="dm-link" id="dm-forgot-password">Forgot password?</button></p>
            </section>
            <section class="dm-register-panel">
                <h2>New account</h2>
                <button type="button" class="dm-link" id="dm-register-toggle" aria-expanded="${!registered}">${registered ? 'Create account' : 'Register a handle'}</button>
                <form id="dm-register-form" ${registered ? 'hidden' : ''}>
                    <label>Choose a handle<input name="handle" required minlength="3" maxlength="24" pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}" autocomplete="off" spellcheck="false"></label>
                    <label>Password<input name="password" type="password" minlength="8" maxlength="72" required autocomplete="off"></label>
                    <label>Confirm password<input name="confirm" type="password" minlength="8" maxlength="72" required autocomplete="off"></label>
                    <label>Secret question<select name="question" required>
                        <option value="">Select a question</option>
                        <option value="school">What was the name of your first school?</option>
                        <option value="street">What street did you grow up on?</option>
                        <option value="pet">What was the name of your first pet?</option>
                        <option value="nickname">What was your childhood nickname?</option>
                        <option value="firstcar">What was your first car?</option>
                    </select></label>
                    <label>Secret answer<input name="answer" required minlength="3" maxlength="100" autocomplete="off"></label>
                    <p class="dm-register-note">Remember your answer. You can use a made-up one.</p>
                    <button type="submit">Register</button>
                </form>
            </section>
        </div>`);
    const register=document.getElementById('dm-register-form');
    const toggle=document.getElementById('dm-register-toggle');
    toggle?.addEventListener('click',()=>{
        register.hidden=!register.hidden;
        toggle.setAttribute('aria-expanded',String(!register.hidden));
        if (!register.hidden) register.querySelector('input[name="handle"]')?.focus();
    });
    document.getElementById('dm-forgot-password')?.addEventListener('click',()=>dmRecovery('handle',knownHandle));
    document.getElementById('dm-login-form')?.addEventListener('submit',async e=>{
        e.preventDefault();
        const form=e.currentTarget, button=form.querySelector('button[type="submit"]');
        button.disabled=true;
        const payload=Object.fromEntries(new FormData(form).entries());
        const result=await dmCall('login',payload);
        if(result?.ok){dmHandle=result.handle;dmAfterSignIn();}
        else dmEntry(registered,result?.message || 'Could not sign in.',payload.handle || knownHandle);
    });
    register?.addEventListener('submit',async e=>{
        e.preventDefault();
        const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
        const payload=Object.fromEntries(new FormData(form).entries());
        if(payload.password!==payload.confirm){
            form.querySelector('[name="confirm"]').setCustomValidity('Passwords do not match.');
            form.reportValidity();
            form.querySelector('[name="confirm"]').setCustomValidity('');
            return;
        }
        button.disabled=true;
        const result=await dmCall('register',{handle:payload.handle,password:payload.password,question:payload.question,answer:payload.answer});
        if(result?.ok){dmHandle=result.handle;dmAfterSignIn();}
        else {
            form.querySelector('.dm-error')?.remove();
            const error=document.createElement('p');error.className='dm-error';error.textContent=result?.message || 'Could not register.';
            form.prepend(error);
            button.disabled=false;
        }
    });
}
function dmRecovery(stage='handle', handle='', question='', error='') {
    const back='<p><button type="button" class="dm-link" id="dm-recovery-back">back to login</button> &nbsp; | &nbsp; <button type="button" class="dm-link" id="dm-recovery-new">Create a new handle</button></p>';
    let body='';
    if(stage==='handle') body=`<form id="dm-recovery-form"><label>Handle<input name="handle" value="${esc(handle)}" maxlength="24" required autocomplete="off"></label>
        <button type="submit">Continue</button></form>`;
    else if(stage==='answer') body=`<p>Handle: <b>${esc(handle)}</b></p><p>${esc(question)}</p>
        <form id="dm-recovery-form"><label>Secret answer<input name="answer" maxlength="100" minlength="3" required autocomplete="off"></label><button type="submit">Continue</button></form>`;
    else body=`<p>Handle: <b>${esc(handle)}</b></p><form id="dm-recovery-form">
        <label>New password<input name="password" type="password" minlength="8" maxlength="72" required autocomplete="off"></label>
        <label>Confirm password<input name="confirm" type="password" minlength="8" maxlength="72" required autocomplete="off"></label>
        <button type="submit">Change password</button></form>`;
    dmShell(`<div class="dm-recovery"><h2>Password recovery</h2>
        ${error?`<p class="dm-error" role="alert">${esc(error)}</p>`:''}${body}${back}</div>`);
    document.getElementById('dm-recovery-back')?.addEventListener('click',()=>dmEntry(true,'',handle));
    document.getElementById('dm-recovery-new')?.addEventListener('click',()=>{dmEntry(true);document.getElementById('dm-register-toggle')?.click();});
    document.getElementById('dm-recovery-form')?.addEventListener('submit',async e=>{
        e.preventDefault();
        const form=e.currentTarget;
        const button=form.querySelector('button[type="submit"]');
        const values=Object.fromEntries(new FormData(form).entries());
        if(stage==='reset' && values.password!==values.confirm){dmRecovery(stage,handle,question,'Passwords do not match.');return;}
        button.disabled=true;
        const action=stage==='handle'?'recoveryQuestion':stage==='answer'?'recoveryAnswer':'recoveryReset';
        const result=await dmCall(action,stage==='handle'?{handle:values.handle}:stage==='answer'?{handle,answer:values.answer}:{password:values.password});
        if(!result?.ok){
            dmRecovery(stage,stage==='handle'?values.handle:handle,question,result?.message || 'Recovery failed.');
            return;
        }
        if(stage==='handle')dmRecovery('answer',result.handle,result.question);
        else if(stage==='answer')dmRecovery('reset',handle,question);
        else dmEntry(true,'Password changed. Log in with your new password.',result.handle || handle);
    });
}
async function dmNavigate(view='home',value=null) {
    const request=++dmView;
    if(view==='entry')return renderDarkMarket();
    dmBusy();
    let res;
    if(view==='home' || view==='forums')res=await dmCall('home');
    else if(view==='board'){dmBoard=Number(value);res=await dmCall('board',{id:dmBoard});}
    else if(view==='topic'){dmTopic=Number(value);res=await dmCall('topic',{id:dmTopic});}
    else if(view==='ads')res=await dmCall('ads',{kind:dmKind,query:dmQuery});
    else if(view==='ad')res=await dmCall('ad',{id:value});
    else if(view==='messages')res=await dmCall('messages');
    else if(view==='message')res=await dmCall('message',{id:value});
    else if(view==='members')res=await dmCall('members');
    else if(view==='profile')res=await dmCall('profile',{handle:value});
    else if(view==='newBoard')return dmNewBoard();
    else if(view==='newTopic')return dmNewTopic();
    else if(view==='newAd')return dmNewAd();
    else if(view==='compose')return dmCompose(value || '');
    if(request!==dmView || state.browserCurrent!=='darkmarket')return;
    if(!res?.ok){if(res?.loginRequired)return renderDarkMarket();dmShell(dmError(res));return;}
    if(view==='home')return dmHome(res);
    if(view==='forums')return dmForums(res.boards);
    if(view==='board')return dmBoardPage(res);
    if(view==='topic')return dmTopicPage(res);
    if(view==='ads')return dmAds(res.ads);
    if(view==='ad')return dmAd(res.ad);
    if(view==='messages')return dmMessages(res.messages);
    if(view==='message')return dmMessage(res.message);
    if(view==='members')return dmMembers(res.members);
    if(view==='profile')return dmProfile(res.profile);
}
function dmBoardRows(boards) {
    return boards?.length ? `<table class="dm-table"><thead><tr><th>BOARD</th><th>SYSOP</th><th>TOPICS</th></tr></thead><tbody>${boards.map(b=>`<tr><td><button class="dm-link" data-dm-board="${Number(b.id)}">${esc(b.title)}</button><small>${esc(b.description)}</small>${dmAdminButton('darkBoard',b.id)}</td><td>${esc(b.handle)}</td><td>${Number(b.topics)||0}</td></tr>`).join('')}</tbody></table>` : '<p>No boards yet.</p>';
}
function dmHome(res) {
    dmShell(`<div class="dm-home-summary"><b>${Number(res.inbox)||0}</b> private message(s) &nbsp; <button class="dm-link" data-dm-go="messages">read mail</button></div>
    <div class="dm-columns"><div class="dm-main-column">
        <h2>Discussion boards</h2>${dmBoardRows(res.boards)}
        <p class="dm-actionline"><button class="dm-link" data-dm-go="newBoard">Create a board</button> &nbsp;|&nbsp; <button class="dm-link" data-dm-go="forums">All boards</button></p>
        <h2>Recent discussions</h2>${res.topics?.length ? `<ul class="dm-simple-list">${res.topics.map(t=>`<li><button class="dm-link" data-dm-topic="${t.id}">${esc(t.title)}</button> <small>by ${esc(t.handle)}</small></li>`).join('')}</ul>` : '<p>No discussions yet.</p>'}
    </div><aside class="dm-aside">
        <h2>Classifieds</h2>${res.ads?.length?`<ul class="dm-simple-list">${res.ads.map(a=>`<li><button class="dm-link" data-dm-ad="${a.id}">${esc(a.title)}</button><small>${esc(a.kind)}</small></li>`).join('')}</ul>`:'<p>No ads yet.</p>'}
        <p class="dm-actionline"><button class="dm-link" data-dm-go="ads">Browse ads</button> &nbsp;|&nbsp; <button class="dm-link" data-dm-go="newAd">Post ad</button></p>
        <p class="dm-side-note">Arrange deals through private messages.</p>
    </aside></div>`);
    dmWireItems();
}
function dmForums(boards){dmShell(`<h2>Discussion boards</h2><p><button class="dm-link" data-dm-go="newBoard">[ CREATE BOARD ]</button></p>${dmBoardRows(boards)}`);dmWireItems();}
function dmBoardPage(res){const b=res.board;dmShell(`<div class="dm-breadcrumb"><button data-dm-go="forums">FORUMS</button> / ${esc(b.title)}</div><h2>${esc(b.title)}</h2><p>${esc(b.description)}</p><p><button class="dm-link" data-dm-go="newTopic">[ START DISCUSSION ]</button></p>
    <table class="dm-table"><tr><th>TOPIC</th><th>AUTHOR</th><th>REPLIES</th></tr>${res.topics.map(t=>`<tr><td><button class="dm-link" data-dm-topic="${t.id}">${esc(t.title)}</button>${dmAdminButton('darkTopic',t.id)}</td><td>${esc(t.handle)}</td><td>${Number(t.replies)||0}</td></tr>`).join('')}</table>`);dmWireItems();}
function dmTopicPage(res){const t=res.topic;dmBoard=t.board_id;dmShell(`<div class="dm-breadcrumb"><button data-dm-board="${t.board_id}">BOARD</button> / TOPIC ${Number(t.id)}</div><h2>${esc(t.title)}</h2>
    <article class="dm-post"><div class="dm-post-head">${esc(t.handle)} <small>${dmDate(t.created_at)}</small>${dmAdminButton('darkTopic',t.id)}</div><p>${dmText(t.body)}</p><button class="dm-link" data-dm-compose="${esc(t.handle)}">[ PRIVATE MESSAGE ]</button></article>
    <h2>REPLIES (${res.replies.length})</h2>${res.replies.map(r=>`<article class="dm-post"><div class="dm-post-head">${esc(r.handle)} <small>${dmDate(r.created_at)}</small>${dmAdminButton('darkReply',r.id)}</div><p>${dmText(r.body)}</p><button class="dm-link" data-dm-compose="${esc(r.handle)}">[ MESSAGE ]</button></article>`).join('')}
    <h2>REPLY</h2><form id="dm-reply-form"><label>Message<textarea name="body" maxlength="2500" rows="4" required></textarea></label><button>POST REPLY</button><span class="dm-form-error"></span></form>`);
    dmWireItems();dmSubmit('dm-reply-form','reply',{id:t.id},()=>dmNavigate('topic',t.id));}
function dmAds(ads){dmShell(`<h2>Classifieds</h2><div class="dm-filter"><button class="dm-link" data-dm-filter="">ALL</button> | <button class="dm-link" data-dm-filter="sale">FOR SALE</button> | <button class="dm-link" data-dm-filter="wanted">WANTED</button>
    <form id="dm-search-form"><input name="query" aria-label="Search classifieds" maxlength="80" value="${esc(dmQuery)}" placeholder="Search"><button>FIND</button></form></div><p><button class="dm-link" data-dm-go="newAd">[ POST CLASSIFIED ]</button></p>
    <table class="dm-table"><tr><th>TYPE</th><th>SUBJECT</th><th>ASKING</th><th>HANDLE</th></tr>${ads.map(a=>`<tr><td>${esc(a.kind).toUpperCase()}</td><td><button class="dm-link" data-dm-ad="${a.id}">${esc(a.title)}</button>${dmAdminButton('darkAd',a.id)}</td><td>${a.price==null?'ASK':money(a.price)||'$0'}</td><td>${esc(a.handle)}</td></tr>`).join('')}</table>${ads.length?'':'<p>No matching advertisements.</p>'}`);
    dmWireItems();document.querySelectorAll('[data-dm-filter]').forEach(b=>b.addEventListener('click',()=>{dmKind=b.dataset.dmFilter;dmNavigate('ads');}));
    document.querySelector('#dm-search-form').addEventListener('submit',e=>{e.preventDefault();dmQuery=new FormData(e.currentTarget).get('query').trim();dmNavigate('ads');});}
function dmAd(a){dmShell(`<div class="dm-breadcrumb"><button data-dm-go="ads">CLASSIFIEDS</button> / AD ${Number(a.id)}</div><h2>${esc(a.title)}</h2>
    <article class="dm-post"><div class="dm-post-head">${esc(a.kind).toUpperCase()} / ${esc(a.category)} ${dmAdminButton('darkAd',a.id)}</div><p><b>Asking:</b> ${a.price==null?'Contact seller':money(a.price)||'$0'}</p><p><b>Posted by:</b> ${esc(a.handle)} / ${dmDate(a.created_at)}</p><hr><p>${dmText(a.body)}</p><p><button class="dm-link" data-dm-compose="${esc(a.handle)}">[ CONTACT MEMBER ]</button></p></article>`);dmWireItems();}
function dmMessages(items){dmShell(`<h2>Private messages</h2><p><button class="dm-link" data-dm-go="compose">[ WRITE MESSAGE ]</button></p><table class="dm-table"><tr><th>TYPE</th><th>FROM / TO</th><th>SUBJECT</th><th>DATE</th></tr>${items.map(m=>`<tr><td>${m.folder==='sent'?'SENT':'IN'}</td><td>${esc(m.folder==='sent'?m.recipient:m.sender)}</td><td><button class="dm-link" data-dm-message="${m.id}">${esc(m.subject)}</button></td><td>${dmDate(m.created_at)}</td></tr>`).join('')}</table>${items.length?'':'<p>No messages.</p>'}`);dmWireItems();}
function dmMessage(m){dmShell(`<p><button class="dm-link" data-dm-go="messages">[ BACK TO MESSAGES ]</button></p><h2>${esc(m.subject)}</h2><article class="dm-post"><div class="dm-post-head">FROM: ${esc(m.sender)}<br>TO: ${esc(m.recipient)}<br>DATE: ${dmDate(m.created_at)}</div><p>${dmText(m.body)}</p></article><p><button class="dm-link" data-dm-compose="${esc(m.sender===dmHandle?m.recipient:m.sender)}">[ REPLY ]</button></p>`);dmWireItems();}
function dmMembers(items){dmShell(`<h2>Members</h2><div class="dm-member-list">${items.map(m=>`<p><button class="dm-link" data-dm-profile="${esc(m.handle)}">${esc(m.handle)}</button>${m.system ? '<small>member profile</small>' : `<small>member since ${dmDate(m.created_at)}</small>`}</p>`).join('')}</div>`);dmWireItems();}
function dmProfile(member){
    const system=!!member.system;
    dmShell(`<p><button class="dm-link" data-dm-go="members">Members</button> / ${esc(member.handle)}</p>
        <h2>${esc(member.handle)}</h2>
        ${system ? '<h3>Tasks</h3><p>Nothing available.</p>' : `<p>Member since ${dmDate(member.created_at)}</p><p><button class="dm-link" data-dm-compose="${esc(member.handle)}">Send private message</button></p>`}`);
    dmWireItems();
}
function dmForm(title,fields,formId,action,payload,after){dmShell(`<p><button class="dm-link" data-dm-go="home">[ BACK ]</button></p><h2>${title}</h2><form id="${formId}" class="dm-entry-form">${fields}<button type="submit">SUBMIT</button> <span class="dm-form-error"></span></form>`);dmSubmit(formId,action,payload,after);}
function dmSubmit(formId,action,extra,after){document.getElementById(formId)?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;const button=form.querySelector('button[type=submit], button');button.disabled=true;
    const payload=Object.fromEntries(new FormData(form).entries());const result=await dmCall(action,{...extra,...payload});
    if(result.ok)after(result);else{const error=form.querySelector('.dm-form-error');if(error)error.textContent=result.message||'Could not submit.';button.disabled=false;}
});}
function dmNewBoard(){dmForm('CREATE DISCUSSION BOARD',`<label>Board name<input name="title" maxlength="70" required></label><label>Description<input name="description" maxlength="180" required></label>`,'dm-board-form','createBoard',{},r=>dmNavigate('board',r.id));}
function dmNewTopic(){dmForm('START DISCUSSION',`<label>Subject<input name="title" maxlength="120" required></label><label>Message<textarea name="body" rows="6" maxlength="4000" required></textarea></label>`,'dm-topic-form','createTopic',{id:dmBoard},r=>dmNavigate('topic',r.id));}
function dmNewAd(){dmForm('POST CLASSIFIED',`<label>Type<select name="kind"><option value="sale">For Sale</option><option value="wanted">Wanted</option></select></label>
    <label>Category<select name="category"><option>General</option><option>Vehicles</option><option>Parts</option><option>Equipment</option><option>Services</option><option>Other</option></select></label>
    <label>Title<input name="title" maxlength="120" required></label><label>Asking price (optional)<input name="price" type="number" min="0" max="100000000"></label><label>Description<textarea name="body" maxlength="4000" rows="6" required></textarea></label>`,'dm-ad-form','createAd',{},r=>dmNavigate('ad',r.id));}
function dmCompose(to=''){dmForm('PRIVATE MESSAGE',`<label>To (handle)<input name="recipient" value="${esc(to)}" maxlength="24" required></label><label>Subject<input name="subject" maxlength="120" required></label>
    <label>Message<textarea name="body" maxlength="5000" rows="7" required></textarea></label>`,'dm-message-form','sendMessage',{},()=>dmNavigate('messages'));}
function dmWireItems(){
    document.querySelectorAll('[data-dm-board]').forEach(el=>el.addEventListener('click',()=>dmNavigate('board',el.dataset.dmBoard)));
    document.querySelectorAll('[data-dm-topic]').forEach(el=>el.addEventListener('click',()=>dmNavigate('topic',el.dataset.dmTopic)));
    document.querySelectorAll('[data-dm-ad]').forEach(el=>el.addEventListener('click',()=>dmNavigate('ad',el.dataset.dmAd)));
    document.querySelectorAll('[data-dm-profile]').forEach(el=>el.addEventListener('click',()=>dmNavigate('profile',el.dataset.dmProfile)));
    document.querySelectorAll('[data-dm-message]').forEach(el=>el.addEventListener('click',()=>dmNavigate('message',el.dataset.dmMessage)));
    document.querySelectorAll('[data-dm-compose]').forEach(el=>el.addEventListener('click',()=>dmNavigate('compose',el.dataset.dmCompose)));
    document.querySelectorAll('[data-dm-go]').forEach(el=>{if(el.dataset.dmWired)return;el.dataset.dmWired='1';el.addEventListener('click',()=>dmNavigate(el.dataset.dmGo));});
    document.querySelectorAll('.dm-admin-inspect').forEach(el=>{if(el.dataset.dmWired)return;el.dataset.dmWired='1';el.addEventListener('click',()=>dmInspect(el.dataset.adminKind,Number(el.dataset.adminId),el));});
}

async function dmInspect(kind,id,button){
    if(!state.adminMode)return;
    const result=await nui('darkmarketAdmin',{action:'identify',kind,id});
    if(!result.ok)return window.alert(result.message||'Not found.');
    const info=result.person;
    let container=button.nextElementSibling;
    if(!container?.classList?.contains('dm-inspection')){container=document.createElement('span');container.className='dm-inspection';button.after(container);}
    container.innerHTML=`<b> ${esc(info.characterName)}</b> | ID: ${esc(info.citizenid)}${info.serverId?' | Server ID: '+Number(info.serverId):' | Offline'} <button type="button" class="dm-remove">DELETE</button>`;
    container.querySelector('.dm-remove').addEventListener('click',async()=>{
        if(!window.confirm('Delete this post? This cannot be undone.'))return;
        const outcome=await nui('darkmarketAdmin',{action:'delete',kind,id});
        if(!outcome.ok)return window.alert(outcome.message||'Could not delete.');
        if(state.browserCurrent==='darkmarket')dmNavigate('home');
        else if(state.browserCurrent==='truthfiles')showTruthHome();
        else if(state.browserCurrent==='shack'||state.browserCurrent==='motorheadz')loadGatewayCommunity(state.browserCurrent);
        else if(state.browserCurrent==='daveslist')renderDaveslist();
        else if(state.browserCurrent==='jobs')renderPosts('jobs');
    });
}

// Admin Mode is a viewing preference; every privileged operation is separately checked by ACE on the server.
async function dmAdminRefresh(){
    const res=await nui('darkmarketAdmin',{action:'settings'});
    if(res.ok){document.querySelector('#admin-dark-police').checked=!!res.allowPolice;document.querySelector('#admin-mode-toggle').checked=!!state.adminMode;}
}
async function dmAdminSave(){
    const res=await nui('darkmarketAdmin',{action:'saveSettings',allowPolice:!!document.querySelector('#admin-dark-police').checked});
    document.querySelector('#admin-save-status').textContent=res.ok?'DarkMarket settings saved.':(res.message||'Save failed.');
}
function dmAdminToggle(){state.adminMode=!!document.querySelector('#admin-mode-toggle').checked;
    if(state.browserCurrent==='darkmarket')dmNavigate('home');
}
