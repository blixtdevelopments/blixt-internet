-- DarkMarket, one anonymous community with server-owned identities and permissions.
local sessions = {}
local failures = {}
local recoveryAttempts = {}
local resetGrants = {}

-- Secret questions are deliberately account-based, never linked to MOL email.
local secretQuestions = {
    school = "What was the name of your first school?",
    street = "What street did you grow up on?",
    pet = "What was the name of your first pet?",
    nickname = "What was your childhood nickname?",
    firstcar = "What was your first car?"
}
local function cleanAnswer(value)
    return tostring(value or ""):gsub("%z", ""):lower():match("^%s*(.-)%s*$"):gsub("%s+", " ")
end
local function recoveryLocked(owner)
    local record = recoveryAttempts[owner]
    if not record then return false end
    if record.lockUntil and os.time() < record.lockUntil then return true end
    if not record.started or os.time() - record.started > 600 or record.lockUntil then
        recoveryAttempts[owner] = nil
    end
    return false
end
local function recoveryFailed(owner)
    local old = recoveryAttempts[owner]
    if not old or os.time() - old.started > 600 then old = {started=os.time(), count=0} end
    old.count = old.count + 1
    if old.count >= 5 then old.lockUntil = os.time() + 600 end
    recoveryAttempts[owner] = old
end
local settingsFile = 'darkmarket-settings.json'
local options = { allowPolice = false }
local raw = LoadResourceFile(GetCurrentResourceName(), settingsFile)
if raw then
    local ok, data = pcall(json.decode, raw)
    if ok and type(data) == 'table' then options.allowPolice = data.allowPolice == true end
end

local function text(value, limit)
    local s = tostring(value or ''):gsub('%z', ''):gsub('\r', ''):match('^%s*(.-)%s*$') or ''
    return s:sub(1, limit or 3000)
end
local function cid(src)
    local p = Bridge.GetPlayer(src)
    local d = p and p.PlayerData
    return d and d.citizenid or nil
end
local function realName(src)
    local p = Bridge.GetPlayer(src)
    local d = p and p.PlayerData
    local c = d and d.charinfo or {}
    local name = text((c.firstname or c.firstName or '') .. ' ' .. (c.lastname or c.lastName or ''), 96)
    return name ~= '' and name or (GetPlayerName(src) or 'Unknown')
end
local function admin(src)
    local permitted = IsPlayerAceAllowed(src, 'blixtinternet.admin')
    return permitted == true or permitted == 1
end
local function jobBlocked(src)
    if options.allowPolice then return false end
    local p = Bridge.GetPlayer(src)
    local job = p and p.PlayerData and p.PlayerData.job
    local jobType = type(job) == 'table' and job.type or nil
    local restrictedType = Config.DarkMarket and Config.DarkMarket.restrictedJobType or 'leo'
    return tostring(jobType or ''):lower() == tostring(restrictedType):lower()
end
local function access(src)
    if not cid(src) then return false, 'Character unavailable.' end
    if jobBlocked(src) then return false, 'This service is unavailable.' end
    return true
end
local function account(src)
    local id = cid(src)
    local login = sessions[src]
    if not id or type(login) ~= 'table' or login.citizenid ~= id then return nil end
    -- Account id must be bound to the character; never accept a client-selected account id.
    return MySQL.single.await('SELECT id, handle, citizenid FROM blixt_internet_dark_accounts WHERE id=? AND citizenid=? LIMIT 1', {login.accountId,id})
end
local function required(src)
    local allowed, msg = access(src)
    if not allowed then return nil, msg end
    return account(src), 'Sign in to DarkMarket first.'
end
local function limited(tableName, owner, minutes, max)
    local row = MySQL.single.await(('SELECT COUNT(*) AS n FROM `%s` WHERE account_id=? AND created_at > DATE_SUB(NOW(), INTERVAL %d MINUTE)'):format(tableName, minutes), {owner})
    return row and tonumber(row.n) >= max
end

AddEventHandler('playerDropped', function() sessions[source] = nil; resetGrants[source] = nil end)
RegisterNetEvent('blixt-internet:server:darkLogout', function() sessions[source] = nil; resetGrants[source] = nil end)

local discovery = Config.DarkMarket and Config.DarkMarket.discoveryKeywords or {'private exchange', 'blackmarket', 'black market', 'hacking', 'hacker', 'nitrous'}
local function discover(query)
    query = text(query, 100):lower():gsub('%s+', ' ')
    for _, keyword in ipairs(discovery) do
        if keyword ~= '' and query:find(keyword:lower(), 1, true) then return true end
    end
    return false
end

Bridge.RegisterCallback('blixt-internet:server:darkmarket', function(src, data)
    data = type(data) == 'table' and data or {}
    local action = text(data.action, 30)
    if action == 'discover' then return {ok=true, found=discover(data.query)} end
    if not BlixtInternetDB.ready then return {ok=false, message='DarkMarket is starting. Try again.'} end
    local allowed, msg = access(src)
    if not allowed then return {ok=false, blocked=true, message=msg} end
    local current = account(src)
    if action == 'status' then
        local exists = MySQL.single.await('SELECT handle FROM blixt_internet_dark_accounts WHERE citizenid=? ORDER BY id DESC LIMIT 1', {cid(src)})
        return {ok=true, loggedIn=current ~= nil, registered=exists ~= nil, registeredHandle=exists and exists.handle or nil, handle=current and current.handle or nil, isAdmin=admin(src)}
    end
    if action == 'register' then
        if current then return {ok=false, message='Already signed in.'} end
        local handle = text(data.handle, 25):lower()
        local password = tostring(data.password or '')
        if not handle:match('^[a-z][a-z0-9_]+$') or #handle < 3 or #handle > 24 then
            return {ok=false, message='Handle: 3-24 letters, numbers or underscores. Start with a letter.'}
        end
        if #password < 8 or #password > 72 then return {ok=false, message='Password must have 8-72 characters.'} end
        if handle == 'thetruth' then return {ok=false, message='Handle already in use.'} end
        if MySQL.single.await('SELECT id FROM blixt_internet_dark_accounts WHERE handle=?', {handle}) then
            return {ok=false, message='Handle already in use.'}
        end
        local question = text(data.question, 32)
        local answer = cleanAnswer(data.answer)
        if not secretQuestions[question] then return {ok=false, message='Choose a recovery question.'} end
        if #answer < 3 or #answer > 100 then return {ok=false, message='Secret answer must be 3-100 characters.'} end
        -- Throttle creation per character without preventing replacement handles later.
        local count = MySQL.single.await([[SELECT COUNT(*) AS n FROM blixt_internet_dark_accounts
            WHERE citizenid=? AND created_at>DATE_SUB(NOW(), INTERVAL 1 HOUR)]], {cid(src)})
        if count and tonumber(count.n) >= 3 then return {ok=false, message='Too many new accounts. Try again later.'} end
        local row = MySQL.single.await('SELECT UUID() AS salt')
        local secret = MySQL.single.await('SELECT UUID() AS salt')
        local ok, inserted = pcall(function()
            return MySQL.insert.await([[INSERT INTO blixt_internet_dark_accounts
                (citizenid,character_name,handle,salt,password_hash,secret_question,secret_salt,secret_hash)
                VALUES (?,?,?,?,SHA2(CONCAT(?,?),256),?,?,SHA2(CONCAT(?,?),256))]],
                {cid(src), realName(src), handle, row.salt, row.salt, password,
                    question, secret.salt, secret.salt, answer})
        end)
        if not ok or not inserted then return {ok=false, message='Could not register. Try another handle.'} end
        sessions[src] = {citizenid=cid(src),accountId=inserted}
        failures[cid(src)] = nil
        return {ok=true, handle=handle}
    end
    if action == 'login' then
        local owner = cid(src)
        local lock = failures[owner]
        if lock and ((lock.untilTime and os.time() >= lock.untilTime) or (lock.started and os.time() - lock.started >= 300 and not lock.untilTime)) then
            failures[owner] = nil
            lock = nil
        end
        if lock and lock.untilTime then return {ok=false, message='Too many attempts. Try again later.'} end
        local password = tostring(data.password or '')
        local handle = text(data.handle,24):lower()
        if #password > 72 or #handle < 3 then return {ok=false, message='Enter your handle and password.'} end
        if handle == 'thetruth' then return {ok=false, message='Incorrect handle or password.'} end
        local row = MySQL.single.await([[SELECT id, handle FROM blixt_internet_dark_accounts WHERE citizenid=? AND handle=?
            AND password_hash=SHA2(CONCAT(salt,?),256)]], {cid(src), handle, password})
        if not row then
            local n = lock and (lock.count or 0) + 1 or 1
            failures[owner] = { count=n, started=lock and lock.started or os.time(), untilTime=n>=5 and os.time()+60 or nil }
            return {ok=false, message='Incorrect handle or password.'}
        end
        sessions[src] = {citizenid=cid(src),accountId=row.id}
        failures[cid(src)] = nil
        resetGrants[src] = nil
        return {ok=true, handle=row.handle}
    end
    -- Recovery never uses MOL or reveals another character's question.
    if action == 'recoveryQuestion' then
        if recoveryLocked(cid(src)) then return {ok=false, message='Too many attempts. Try again later.'} end
        local handle = text(data.handle, 24):lower()
        local row = MySQL.single.await([[SELECT secret_question FROM blixt_internet_dark_accounts
            WHERE citizenid=? AND handle=? LIMIT 1]], {cid(src),handle})
        if not row then return {ok=false, message='No account with that handle on this character.'} end
        if not secretQuestions[row.secret_question] then
            return {ok=false, message='This older account has no recovery question. You can create a new handle.'}
        end
        resetGrants[src] = nil
        return {ok=true, handle=handle, question=secretQuestions[row.secret_question]}
    end
    if action == 'recoveryAnswer' then
        local owner = cid(src)
        if recoveryLocked(owner) then return {ok=false, message='Too many attempts. Try again later.'} end
        local handle = text(data.handle, 24):lower()
        local answer = cleanAnswer(data.answer)
        if #answer < 3 or #answer > 100 then return {ok=false, message='Incorrect answer.'} end
        local row = MySQL.single.await([[SELECT id FROM blixt_internet_dark_accounts WHERE citizenid=? AND handle=?
            AND secret_hash=SHA2(CONCAT(secret_salt,?),256) AND secret_hash IS NOT NULL LIMIT 1]],
            {owner, handle, answer})
        if not row then
            resetGrants[src] = nil
            recoveryFailed(owner)
            return {ok=false, message='Incorrect answer.'}
        end
        recoveryAttempts[owner] = nil
        resetGrants[src] = {citizenid=owner, accountId=row.id, handle=handle, expiry=os.time()+300}
        return {ok=true}
    end
    if action == 'recoveryReset' then
        local grant = resetGrants[src]
        resetGrants[src] = nil -- single use, including invalid submissions
        if not grant or grant.citizenid ~= cid(src) or os.time() > grant.expiry then
            return {ok=false, message='Recovery expired. Start again.'}
        end
        local password = tostring(data.password or '')
        if #password < 8 or #password > 72 then return {ok=false, message='Password must have 8-72 characters. Start again.'} end
        local salt = MySQL.single.await('SELECT UUID() AS salt')
        local changed = MySQL.update.await([[UPDATE blixt_internet_dark_accounts SET salt=?,password_hash=SHA2(CONCAT(?,?),256)
            WHERE id=? AND citizenid=?]], {salt.salt,salt.salt,password,grant.accountId,grant.citizenid})
        if not changed or changed < 1 then return {ok=false, message='Account not found.'} end
        sessions[src] = nil
        failures[cid(src)] = nil
        return {ok=true, handle=grant.handle}
    end
    if action == 'logout' then sessions[src] = nil; resetGrants[src] = nil; return {ok=true} end
    if not current then return {ok=false, loginRequired=true, message='Sign in first.'} end
    local id = math.floor(tonumber(data.id) or 0)
    if action == 'home' then
        local boards = MySQL.query.await([[SELECT b.id,b.title,b.description,a.handle,
            (SELECT COUNT(*) FROM blixt_internet_dark_topics t WHERE t.board_id=b.id) AS topics
            FROM blixt_internet_dark_boards b JOIN blixt_internet_dark_accounts a ON a.id=b.account_id ORDER BY b.created_at DESC LIMIT 45]])
        local topics = MySQL.query.await([[SELECT t.id,t.title,t.board_id,t.created_at,a.handle FROM blixt_internet_dark_topics t
            JOIN blixt_internet_dark_accounts a ON a.id=t.account_id ORDER BY t.created_at DESC LIMIT 8]])
        local ads = MySQL.query.await([[SELECT d.id,d.title,d.kind,d.price,d.created_at,a.handle FROM blixt_internet_dark_ads d
            JOIN blixt_internet_dark_accounts a ON a.id=d.account_id ORDER BY d.created_at DESC LIMIT 8]])
        local row = MySQL.single.await('SELECT COUNT(*) AS n FROM blixt_internet_dark_messages WHERE recipient_id=?', {current.id})
        return {ok=true, handle=current.handle, boards=boards or {}, topics=topics or {}, ads=ads or {}, inbox=tonumber(row and row.n) or 0}
    end
    if action == 'board' then
        local board = MySQL.single.await('SELECT id,title,description FROM blixt_internet_dark_boards WHERE id=?', {id})
        if not board then return {ok=false,message='Board not found.'} end
        local topics = MySQL.query.await([[SELECT t.id,t.title,t.created_at,a.handle,
            (SELECT COUNT(*) FROM blixt_internet_dark_replies r WHERE r.topic_id=t.id) AS replies
            FROM blixt_internet_dark_topics t JOIN blixt_internet_dark_accounts a ON a.id=t.account_id
            WHERE t.board_id=? ORDER BY t.created_at DESC LIMIT 75]], {id})
        return {ok=true, board=board, topics=topics or {}}
    end
    if action == 'topic' then
        local topic = MySQL.single.await([[SELECT t.id,t.board_id,t.title,t.body,t.created_at,a.handle FROM blixt_internet_dark_topics t
            JOIN blixt_internet_dark_accounts a ON a.id=t.account_id WHERE t.id=?]], {id})
        if not topic then return {ok=false,message='Topic not found.'} end
        local replies = MySQL.query.await([[SELECT r.id,r.body,r.created_at,a.handle FROM blixt_internet_dark_replies r
            JOIN blixt_internet_dark_accounts a ON a.id=r.account_id WHERE r.topic_id=? ORDER BY r.created_at ASC LIMIT 100]], {id})
        return {ok=true, topic=topic, replies=replies or {}}
    end
    if action == 'ads' then
        local kind = data.kind == 'sale' and 'sale' or data.kind == 'wanted' and 'wanted' or nil
        local query = text(data.query, 80):gsub('[%%_]', '')
        local where, args = '1=1', {}
        if kind then where=where..' AND d.kind=?'; args[#args+1]=kind end
        if query~='' then where=where..' AND (d.title LIKE ? OR d.body LIKE ? OR d.category LIKE ?)'; local p='%'..query..'%'; for _=1,3 do args[#args+1]=p end end
        local ads = MySQL.query.await(([[SELECT d.id,d.kind,d.category,d.title,d.price,d.created_at,a.handle FROM blixt_internet_dark_ads d
            JOIN blixt_internet_dark_accounts a ON a.id=d.account_id WHERE %s ORDER BY d.created_at DESC LIMIT 80]]):format(where), args)
        return {ok=true, ads=ads or {}}
    end
    if action == 'ad' then
        local ad = MySQL.single.await([[SELECT d.id,d.kind,d.category,d.title,d.body,d.price,d.created_at,a.handle FROM blixt_internet_dark_ads d
            JOIN blixt_internet_dark_accounts a ON a.id=d.account_id WHERE d.id=?]], {id})
        return {ok=ad~=nil, ad=ad}
    end
    if action == 'messages' then
        local rows = MySQL.query.await([[SELECT m.id,m.subject,m.created_at,sa.handle AS sender, ra.handle AS recipient,
            CASE WHEN m.sender_id=? THEN 'sent' ELSE 'inbox' END AS folder
            FROM blixt_internet_dark_messages m JOIN blixt_internet_dark_accounts sa ON sa.id=m.sender_id
            JOIN blixt_internet_dark_accounts ra ON ra.id=m.recipient_id
            WHERE m.recipient_id=? OR m.sender_id=? ORDER BY m.created_at DESC LIMIT 100]], {current.id,current.id,current.id})
        return {ok=true, messages=rows or {}}
    end
    if action == 'message' then
        local message = MySQL.single.await([[SELECT m.id,m.subject,m.body,m.created_at,sa.handle AS sender,ra.handle AS recipient
            FROM blixt_internet_dark_messages m JOIN blixt_internet_dark_accounts sa ON sa.id=m.sender_id
            JOIN blixt_internet_dark_accounts ra ON ra.id=m.recipient_id WHERE m.id=? AND (m.sender_id=? OR m.recipient_id=?)]], {id,current.id,current.id})
        return {ok=message~=nil, message=message}
    end
    if action == 'members' then
        local members = MySQL.query.await([[SELECT handle,created_at FROM blixt_internet_dark_accounts
            WHERE handle <> 'thetruth' ORDER BY handle LIMIT 99]]) or {}
        table.insert(members, 1, {handle='thetruth', system=true})
        return {ok=true, members=members}
    end
    if action == 'profile' then
        local handle = text(data.handle, 24):lower()
        if handle == 'thetruth' then
            -- Reserved profile: no player owns it, and no tasks are implemented yet.
            return {ok=true, profile={handle='thetruth', system=true, tasks={}}}
        end
        local profile = MySQL.single.await([[SELECT handle, created_at FROM blixt_internet_dark_accounts
            WHERE handle=? LIMIT 1]], {handle})
        return {ok=profile~=nil, profile=profile, message=profile and nil or 'Member not found.'}
    end
    if action == 'createBoard' then
        local title, desc = text(data.title,70), text(data.description,180)
        if #title<3 or #desc<5 then return {ok=false,message='Add a board name and description.'} end
        if limited('blixt_internet_dark_boards',current.id,60,2) then return {ok=false,message='Board creation limit reached.'} end
        return {ok=true,id=MySQL.insert.await('INSERT INTO blixt_internet_dark_boards (account_id,title,description) VALUES (?,?,?)',{current.id,title,desc})}
    end
    if action == 'createTopic' then
        local title, body = text(data.title,120),text(data.body,4000)
        if #title<3 or #body<3 or not MySQL.single.await('SELECT id FROM blixt_internet_dark_boards WHERE id=?', {id}) then return {ok=false,message='Complete the topic or select a board.'} end
        if limited('blixt_internet_dark_topics',current.id,5,4) then return {ok=false,message='Please wait before posting again.'} end
        return {ok=true,id=MySQL.insert.await('INSERT INTO blixt_internet_dark_topics (account_id,board_id,title,body) VALUES (?,?,?,?)',{current.id,id,title,body})}
    end
    if action == 'reply' then
        local body=text(data.body,2500)
        if #body<2 or not MySQL.single.await('SELECT id FROM blixt_internet_dark_topics WHERE id=?',{id}) then return {ok=false,message='Message or topic unavailable.'} end
        if limited('blixt_internet_dark_replies',current.id,1,5) then return {ok=false,message='Please wait before replying.'} end
        MySQL.insert.await('INSERT INTO blixt_internet_dark_replies (account_id,topic_id,body) VALUES (?,?,?)',{current.id,id,body})
        return {ok=true}
    end
    if action == 'createAd' then
        local kind = data.kind == 'sale' and 'sale' or data.kind == 'wanted' and 'wanted' or nil
        local title,body,category=text(data.title,120),text(data.body,4000),text(data.category,40)
        local price = tonumber(data.price)
        if not kind or #title<3 or #body<3 or #category<2 then return {ok=false,message='Complete the advertisement.'} end
        if price then price=math.floor(price); if price<0 or price>100000000 then return {ok=false,message='Invalid price.'} end end
        if limited('blixt_internet_dark_ads',current.id,60,8) then return {ok=false,message='Posting limit reached.'} end
        return {ok=true,id=MySQL.insert.await('INSERT INTO blixt_internet_dark_ads (account_id,kind,category,title,body,price) VALUES (?,?,?,?,?,?)',{current.id,kind,category,title,body,price})}
    end
    if action == 'sendMessage' then
        local recipient=text(data.recipient,24):lower()
        if recipient == 'thetruth' then return {ok=false,message='Messages to this handle are unavailable.'} end
        local subject,body=text(data.subject,120),text(data.body,5000)
        if recipient==current.handle then return {ok=false,message='Cannot message yourself.'} end
        if #subject<1 or #body<2 then return {ok=false,message='Subject and message required.'} end
        local other=MySQL.single.await('SELECT id FROM blixt_internet_dark_accounts WHERE handle=?',{recipient})
        if not other then return {ok=false,message='Handle not found.'} end
        local row=MySQL.single.await('SELECT COUNT(*) AS n FROM blixt_internet_dark_messages WHERE sender_id=? AND created_at>DATE_SUB(NOW(), INTERVAL 1 MINUTE)',{current.id})
        if row and tonumber(row.n)>=5 then return {ok=false,message='Please wait before sending another message.'} end
        MySQL.insert.await('INSERT INTO blixt_internet_dark_messages (sender_id,recipient_id,subject,body) VALUES (?,?,?,?)',{current.id,other.id,subject,body})
        return {ok=true}
    end
    return {ok=false,message='Unknown action.'}
end)

local adminTypes = {
    darkBoard={'blixt_internet_dark_boards','account_id'},darkTopic={'blixt_internet_dark_topics','account_id'},
    darkReply={'blixt_internet_dark_replies','account_id'},darkAd={'blixt_internet_dark_ads','account_id'},
    community={'blixt_internet_community','citizenid'}, truthTopic={'blixt_internet_truth_topics','citizenid'},
    truthReply={'blixt_internet_truth_replies','citizenid'}, publicPost={'blixt_internet_posts','citizenid'}
}
local function identity(src, kind, id)
    local mapping=adminTypes[kind]
    if not mapping then return nil end
    local row=MySQL.single.await(('SELECT `%s` AS owner FROM `%s` WHERE id=?'):format(mapping[2],mapping[1]),{id})
    if not row then return nil end
    local owner=row.owner
    local characterName=nil
    if kind:sub(1,4)=='dark' then
        local accountRow=MySQL.single.await('SELECT citizenid,character_name,handle FROM blixt_internet_dark_accounts WHERE id=?',{owner})
        if accountRow then owner=accountRow.citizenid;characterName=accountRow.character_name end
    elseif kind=='publicPost' then
        local post=MySQL.single.await('SELECT author_name FROM blixt_internet_posts WHERE id=?',{id})
        characterName=post and post.author_name
    end
    for _, player in ipairs(GetPlayers()) do
        local ps=tonumber(player)
        if ps and cid(ps)==owner then return {characterName=realName(ps),citizenid=owner,serverId=ps} end
    end
    if not characterName then
        -- Standard QB/Qbox players table, if available. No dependency on its schema for operation.
        local ok, player = pcall(function() return MySQL.single.await('SELECT charinfo FROM players WHERE citizenid=? LIMIT 1',{owner}) end)
        if ok and player and player.charinfo then
            local decodedOK,c=pcall(json.decode,player.charinfo)
            if decodedOK and type(c)=='table' then characterName=text((c.firstname or '')..' '..(c.lastname or ''),96) end
        end
    end
    return {characterName=characterName or 'Unavailable',citizenid=owner,serverId=nil}
end
Bridge.RegisterCallback('blixt-internet:server:darkmarketAdmin',function(src,data)
    if not admin(src) then return {ok=false,message='Administrator privileges required.'} end
    data=type(data)=='table' and data or {}
    local action=text(data.action,24)
    if action=='settings' then return {ok=true,allowPolice=options.allowPolice} end
    if action=='saveSettings' then
        if type(data.allowPolice)~='boolean' then return {ok=false,message='Invalid setting.'} end
        local encoded=json.encode({allowPolice=data.allowPolice})
        if not SaveResourceFile(GetCurrentResourceName(),settingsFile,encoded,-1) then return {ok=false,message='Could not save settings.'} end
        options.allowPolice=data.allowPolice
        return {ok=true,allowPolice=options.allowPolice}
    end
    local kind=text(data.kind,30)
    local id=math.floor(tonumber(data.id) or 0)
    if id<1 or not adminTypes[kind] then return {ok=false,message='Unknown item.'} end
    if action=='identify' then
        local who=identity(src,kind,id)
        return {ok=who~=nil,person=who}
    end
    if action=='delete' then
        if not identity(src,kind,id) then return {ok=false,message='Item not found.'} end
        local map=adminTypes[kind]
        local queries={}
        if kind=='truthTopic' then
            queries[#queries+1]={'DELETE FROM blixt_internet_truth_replies WHERE topic_id=?',{id}}
        elseif kind=='darkTopic' then
            queries[#queries+1]={'DELETE FROM blixt_internet_dark_replies WHERE topic_id=?',{id}}
        elseif kind=='darkBoard' then
            queries[#queries+1]={[[DELETE r FROM blixt_internet_dark_replies r
                INNER JOIN blixt_internet_dark_topics t ON t.id=r.topic_id WHERE t.board_id=?]],{id}}
            queries[#queries+1]={'DELETE FROM blixt_internet_dark_topics WHERE board_id=?',{id}}
        end
        if kind=='publicPost' then
            queries[#queries+1]={"UPDATE blixt_internet_posts SET status='deleted' WHERE id=?",{id}}
        else
            queries[#queries+1]={('DELETE FROM `%s` WHERE id=?'):format(map[1]),{id}}
        end
        queries[#queries+1]={'INSERT INTO blixt_internet_admin_audit (admin_citizenid,item_type,item_id,action) VALUES (?,?,?,?)',
            {cid(src) or 'admin',kind,id,'delete'}}
        local ok, committed=pcall(function() return MySQL.transaction.await(queries) end)
        if not ok or not committed then
            return {ok=false,message='Could not delete item. Please try again.'}
        end
        return {ok=true}
    end
    return {ok=false,message='Unknown operation.'}
end)
