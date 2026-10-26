local activeComputers = {}
local sendingEmail = {}
local postingInProgress = {}

local function debugPrint(...)
    if Config.Debug then
        print('[blixt-internet:server]', ...)
    end
end

local function notify(src, message, notifyType)
    Bridge.Notify(src, message, notifyType, 'Computer')
end

local function trim(str)
    str = tostring(str or '')
    return str:match('^%s*(.-)%s*$')
end

local function lower(str)
    return string.lower(tostring(str or ''))
end

local function getPlayer(src)
    return Bridge.GetPlayer(src)
end

local function getCitizenId(src)
    local player = getPlayer(src)
    if player and player.PlayerData and player.PlayerData.citizenid then
        return player.PlayerData.citizenid
    end
    return ('license:%s'):format(GetPlayerIdentifierByType(src, 'license') or src)
end

local function getCharacterName(src)
    local player = getPlayer(src)
    local data = player and player.PlayerData
    if data and data.charinfo then
        local first = data.charinfo.firstname or data.charinfo.firstName or ''
        local last = data.charinfo.lastname or data.charinfo.lastName or ''
        local full = trim(first .. ' ' .. last)
        if full ~= '' then return full end
    end
    return GetPlayerName(src) or ('Player %s'):format(src)
end

local function getPhoneNumber(src)
    local player = getPlayer(src)
    local data = player and player.PlayerData
    if data then
        if data.charinfo then
            local phone = data.charinfo.phone or data.charinfo.phone_number or data.charinfo.phonenumber
            phone = trim(phone)
            if phone ~= '' then return phone end
        end
        if data.metadata then
            local phone = data.metadata.phone or data.metadata.phone_number or data.metadata.phonenumber
            phone = trim(phone)
            if phone ~= '' then return phone end
        end
    end
    return ''
end

local function removeMoney(src, amount, reason)
    return Bridge.RemoveMoney(src, 'bank', amount, reason)
end

local function cleanText(value, maxLen)
    value = trim(value)
    value = value:gsub('[\0\r]', '')
    if maxLen and #value > maxLen then
        value = value:sub(1, maxLen)
    end
    return value
end

local function cleanUrl(value, maxLen)
    value = cleanText(value, maxLen or 512)
    if value == '' then return nil end
    if not value:match('^https?://') then
        return nil
    end
    return value
end

local function makeEmail(username)
    username = lower(trim(username))
    username = username:gsub('@' .. Config.Email.domain:gsub('%.', '%%.') .. '$', '')
    return username .. '@' .. Config.Email.domain
end

local function validateUsername(username)
    username = lower(trim(username))
    username = username:gsub('@' .. Config.Email.domain:gsub('%.', '%%.') .. '$', '')

    if #username < Config.Email.minUsernameLength then
        return false, ('Username must be at least %s characters.'):format(Config.Email.minUsernameLength)
    end

    if #username > Config.Email.maxUsernameLength then
        return false, ('Username must be under %s characters.'):format(Config.Email.maxUsernameLength)
    end

    if not username:match(Config.Email.usernamePattern) then
        return false, 'Username can only use letters, numbers, dots, underscores, hyphens, and plus signs.'
    end

    if username:sub(1, 1) == '.' or username:sub(-1) == '.' or username:find('%.%.') then
        return false, 'Username has invalid dot placement.'
    end

    return true, username
end

local function getEmailForCitizen(citizenid)
    local row = MySQL.single.await('SELECT email FROM blixt_internet_accounts WHERE citizenid = ? LIMIT 1', { citizenid })
    return row and row.email or nil
end

Bridge.RegisterCallback('blixt-internet:server:claimComputer', function(src, computerKey)
    if type(computerKey) ~= 'string' or computerKey == '' then return false end
    if activeComputers[computerKey] and activeComputers[computerKey] ~= src then
        return false
    end
    activeComputers[computerKey] = src
    return true
end)

RegisterNetEvent('blixt-internet:server:releaseComputer', function(computerKey)
    local src = source
    if activeComputers[computerKey] == src then
        activeComputers[computerKey] = nil
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    for key, owner in pairs(activeComputers) do
        if owner == src then activeComputers[key] = nil end
    end
end)

local function registerDatabaseCallback(name, handler)
    Bridge.RegisterCallback(name, function(src, ...)
        if not BlixtInternetDB.ready then
            return { ok = false, message = 'Internet database is starting. Please try again.' }
        end
        return handler(src, ...)
    end)
end

registerDatabaseCallback('blixt-internet:server:getSession', function(src)
    local citizenid = getCitizenId(src)
    local email = getEmailForCitizen(citizenid)
    local unread = 0
    if email then
        local row = MySQL.single.await('SELECT COUNT(*) AS count FROM blixt_internet_mail WHERE recipient_email = ? AND is_read = 0 AND deleted_by_recipient = 0', { email })
        unread = row and row.count or 0
    end

    return {
        ok = true,
        citizenid = citizenid,
        name = getCharacterName(src),
        email = email,
        phone = getPhoneNumber(src),
        unread = unread,
        domain = Config.Email.domain,
        categories = Config.Categories
    }
end)

registerDatabaseCallback('blixt-internet:server:registerEmail', function(src, data)
    data = data or {}
    local citizenid = getCitizenId(src)
    local existing = getEmailForCitizen(citizenid)
    if existing then
        return { ok = false, message = 'You already have a MOL account.', email = existing }
    end

    local valid, usernameOrMessage = validateUsername(data.username)
    if not valid then
        return { ok = false, message = usernameOrMessage }
    end

    local email = makeEmail(usernameOrMessage)
    local taken = MySQL.single.await('SELECT id FROM blixt_internet_accounts WHERE email = ? LIMIT 1', { email })
    if taken then
        return { ok = false, message = 'That email address is already taken.' }
    end

    local displayName = getCharacterName(src)
    local inserted, accountId = pcall(function()
        return MySQL.insert.await('INSERT INTO blixt_internet_accounts (citizenid, email, display_name) VALUES (?, ?, ?)', {
            citizenid, email, displayName
        })
    end)
    if not inserted or not accountId then
        return { ok = false, message = 'Could not create this account. Please try again.' }
    end

    return { ok = true, email = email, message = 'MOL account created.' }
end)

registerDatabaseCallback('blixt-internet:server:sendEmail', function(src, data)
    data = data or {}
    local citizenid = getCitizenId(src)
    if sendingEmail[citizenid] then
        return { ok = false, message = 'Please wait for your previous message.' }
    end

    sendingEmail[citizenid] = true
    local ok, result = pcall(function()
        local senderEmail = getEmailForCitizen(citizenid)
        if not senderEmail then
            return { ok = false, message = 'Create a MOL account first.' }
        end

        local recipient = lower(cleanText(data.to, 96))
        if not recipient:find('@', 1, true) then recipient = recipient .. '@' .. Config.Email.domain end
        local subject = cleanText(data.subject, Config.Email.maxSubjectLength)
        local body = cleanText(data.body, Config.Email.maxBodyLength)
        local attachmentUrl = cleanUrl(data.attachmentUrl, 512)
        if recipient == '' or subject == '' or body == '' then
            return { ok = false, message = 'Recipient, subject, and message are required.' }
        end

        local limit = math.max(0, math.floor(tonumber(Config.Email.maxMessagesPerMinute) or 5))
        if limit > 0 then
            local recent = MySQL.single.await([[SELECT COUNT(*) AS n FROM blixt_internet_mail
                WHERE sender_email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)]], { senderEmail })
            if recent and tonumber(recent.n) >= limit then
                return { ok = false, message = 'Too many messages. Please wait a minute.' }
            end
        end

        local exists = MySQL.single.await('SELECT id FROM blixt_internet_accounts WHERE email = ? LIMIT 1', { recipient })
        if not exists then
            return { ok = false, message = 'That MOL address does not exist.' }
        end

        local mailId = MySQL.insert.await([[INSERT INTO blixt_internet_mail
            (sender_citizenid, sender_email, sender_name, recipient_email, subject, body, attachment_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)]], {
            citizenid, senderEmail, getCharacterName(src), recipient, subject, body, attachmentUrl
        })
        if not mailId then return { ok = false, message = 'Message could not be sent.' } end
        return { ok = true, message = 'Email sent.' }
    end)
    sendingEmail[citizenid] = nil
    if not ok then
        print('[blixt-internet] MOL send failed: database operation unsuccessful.')
        return { ok = false, message = 'Message could not be sent. Please try again.' }
    end
    return result
end)

registerDatabaseCallback('blixt-internet:server:getMail', function(src, data)
    data = data or {}
    local citizenid = getCitizenId(src)
    local email = getEmailForCitizen(citizenid)
    if not email then return { ok = false, message = 'No MOL account.' } end

    local box = data.box == 'sent' and 'sent' or 'inbox'
    local rows
    if box == 'sent' then
        rows = MySQL.query.await([[SELECT id, sender_email, sender_name, recipient_email, subject, body, attachment_url, is_read, created_at
            FROM blixt_internet_mail
            WHERE sender_email = ? AND deleted_by_sender = 0
            ORDER BY created_at DESC LIMIT 60]], { email })
    else
        rows = MySQL.query.await([[SELECT id, sender_email, sender_name, recipient_email, subject, body, attachment_url, is_read, created_at
            FROM blixt_internet_mail
            WHERE recipient_email = ? AND deleted_by_recipient = 0
            ORDER BY created_at DESC LIMIT 60]], { email })
    end

    return { ok = true, box = box, mail = rows or {} }
end)

registerDatabaseCallback('blixt-internet:server:markMailRead', function(src, data)
    data = data or {}
    local id = tonumber(data.id)
    if not id then return { ok = false } end

    local citizenid = getCitizenId(src)
    local email = getEmailForCitizen(citizenid)
    if not email then return { ok = false } end

    MySQL.update.await('UPDATE blixt_internet_mail SET is_read = 1 WHERE id = ? AND recipient_email = ?', { id, email })
    return { ok = true }
end)

local function getAllowedCategories(app)
    return app == 'jobs' and Config.Categories.jobs or Config.Categories.daveslist
end

local function categoryAllowed(app, category)
    for _, value in ipairs(getAllowedCategories(app)) do
        if value == category then return true end
    end
    return false
end

registerDatabaseCallback('blixt-internet:server:searchWeb', function(_, data)
    data = data or {}
    local query = cleanText(data.query, 100)
    query = query:gsub('%%', ''):gsub('_', ''):gsub('%s+', ' '):match('^%s*(.-)%s*$')
    if not query or query == '' then return { ok = true, posts = {}, total = 0 } end
    local page = math.max(1, math.min(50, math.floor(tonumber(data.page) or 1)))
    local words = {}
    for word in query:gmatch('%S+') do
        words[#words + 1] = word
        if #words >= 6 then break end
    end
    local where = "app IN ('jobs', 'daveslist') AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())"
    local params = {}
    for _, word in ipairs(words) do
        where = where .. " AND (title LIKE ? OR body LIKE ? OR category LIKE ?)"
        local pattern = '%' .. word .. '%'
        params[#params + 1] = pattern
        params[#params + 1] = pattern
        params[#params + 1] = pattern
    end
    local countRow = MySQL.single.await(('SELECT COUNT(*) AS total FROM blixt_internet_posts WHERE %s'):format(where), params)
    local resultParams = { table.unpack(params) }
    resultParams[#resultParams + 1] = (page - 1) * 20
    local posts = MySQL.query.await(('SELECT id, app, category, title, body, price FROM blixt_internet_posts WHERE %s ORDER BY created_at DESC LIMIT 20 OFFSET ?'):format(where), resultParams)
    return { ok = true, posts = posts or {}, total = tonumber(countRow and countRow.total) or 0 }
end)

registerDatabaseCallback('blixt-internet:server:getPublicPost', function(_, data)
    data = data or {}
    local id = tonumber(data.id)
    local app = data.app
    if not id or (app ~= 'jobs' and app ~= 'daveslist') then return { ok = false } end
    local post = MySQL.single.await([[SELECT id, author_name, contact_email, contact_phone, app, category, title, body, image_url, price, created_at, expires_at
        FROM blixt_internet_posts WHERE id = ? AND app = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())]], { id, app })
    return { ok = post ~= nil, post = post }
end)

registerDatabaseCallback('blixt-internet:server:getPosts', function(_, data)
    data = data or {}
    local app = data.app == 'jobs' and 'jobs' or 'daveslist'
    local category = cleanText(data.category, 64)

    local params = { app }
    local where = "app = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())"
    if category ~= '' and category ~= 'All' then
        where = where .. ' AND category = ?'
        params[#params + 1] = category
    end
    if app == 'daveslist' then
        local query = cleanText(data.query, 100):gsub('%%', ''):gsub('_', ''):match('^%s*(.-)%s*$')
        if query ~= '' then
            local pattern = '%' .. query .. '%'
            where = where .. ' AND (title LIKE ? OR body LIKE ? OR category LIKE ?)'
            params[#params + 1] = pattern
            params[#params + 1] = pattern
            params[#params + 1] = pattern
        end
    end

    local rows = MySQL.query.await(('SELECT id, author_name, contact_email, contact_phone, app, category, title, body, image_url, price, created_at, expires_at FROM blixt_internet_posts WHERE %s ORDER BY created_at DESC LIMIT 80'):format(where), params)
    return { ok = true, posts = rows or {} }
end)

local truthCategories = { sightings=true, government=true, paranormal=true, theories=true, general=true }

registerDatabaseCallback('blixt-internet:server:truthTopics', function(_, data)
    local category = type(data) == 'table' and data.category or ''
    local sql = 'SELECT t.id, t.category, t.nickname, t.title, t.created_at, (SELECT COUNT(*) FROM blixt_internet_truth_replies r WHERE r.topic_id=t.id) AS replies FROM blixt_internet_truth_topics t'
    if truthCategories[category] then
        return {ok=true, topics=MySQL.query.await(sql .. ' WHERE t.category=? ORDER BY t.created_at DESC, t.id DESC LIMIT 60', {category}) or {}}
    end
    return {ok=true, topics=MySQL.query.await(sql .. ' ORDER BY t.created_at DESC, t.id DESC LIMIT 60') or {}}
end)

registerDatabaseCallback('blixt-internet:server:truthTopic', function(_, data)
    local id = type(data)=='table' and math.floor(tonumber(data.id) or 0) or 0
    if id < 1 then return {ok=false} end
    local topic=MySQL.single.await('SELECT id, category, nickname, title, body, image_url, created_at FROM blixt_internet_truth_topics WHERE id=?', {id})
    if not topic then return {ok=false, message='Topic not found.'} end
    local replies=MySQL.query.await('SELECT id, nickname, body, created_at FROM blixt_internet_truth_replies WHERE topic_id=? ORDER BY created_at ASC, id ASC LIMIT 100', {id})
    return {ok=true, topic=topic, replies=replies or {}}
end)

registerDatabaseCallback('blixt-internet:server:truthCreate', function(src, data)
    if type(data)~='table' or not truthCategories[data.category] then return {ok=false,message='Choose a category.'} end
    local citizenid=getCitizenId(src)
    if not citizenid then return {ok=false,message='Character not found.'} end
    local nickname=cleanText(data.nickname,40)
    local title=cleanText(data.title,120)
    local body=cleanText(data.body,2500)
    local url=cleanUrl(data.imageUrl,512)
    if #nickname<2 or #title<3 or #body<10 then return {ok=false,message='Please complete all fields.'} end
    if data.imageUrl and tostring(data.imageUrl):match('%S') and not url then return {ok=false,message='Invalid image link.'} end
    local recent=MySQL.single.await('SELECT COUNT(*) AS total FROM blixt_internet_truth_topics WHERE citizenid=? AND created_at>DATE_SUB(NOW(), INTERVAL 5 MINUTE)',{citizenid})
    if recent and tonumber(recent.total)>=2 then return {ok=false,message='Please wait before posting again.'} end
    local id=MySQL.insert.await('INSERT INTO blixt_internet_truth_topics (citizenid, category, nickname, title, body, image_url) VALUES (?,?,?,?,?,?)',{citizenid,data.category,nickname,title,body,url})
    return {ok=true,id=id}
end)

registerDatabaseCallback('blixt-internet:server:truthReply', function(src, data)
    if type(data)~='table' then return {ok=false} end
    local citizenid=getCitizenId(src)
    if not citizenid then return {ok=false,message='Character not found.'} end
    local id=math.floor(tonumber(data.id) or 0)
    local nickname=cleanText(data.nickname,40)
    local body=cleanText(data.body,1500)
    if id<1 or #nickname<2 or #body<3 then return {ok=false,message='Complete the reply.'} end
    local topic=MySQL.single.await('SELECT id FROM blixt_internet_truth_topics WHERE id=?',{id})
    if not topic then return {ok=false,message='Topic unavailable.'} end
    local recent=MySQL.single.await('SELECT COUNT(*) AS total FROM blixt_internet_truth_replies WHERE citizenid=? AND created_at>DATE_SUB(NOW(), INTERVAL 1 MINUTE)',{citizenid})
    if recent and tonumber(recent.total)>=3 then return {ok=false,message='Please wait before replying again.'} end
    MySQL.insert.await('INSERT INTO blixt_internet_truth_replies (topic_id,citizenid,nickname,body) VALUES (?,?,?,?)',{id,citizenid,nickname,body})
    return {ok=true}
end)

registerDatabaseCallback('blixt-internet:server:getCommunity', function(_, data)
    local site = type(data) == 'table' and data.site or nil
    if site ~= 'shack' and site ~= 'motorheadz' then return { ok = false } end
    local rows = MySQL.query.await('SELECT id, nickname, title, body, image_url, created_at FROM blixt_internet_community WHERE site = ? ORDER BY created_at DESC LIMIT 36', { site })
    return { ok = true, entries = rows or {} }
end)

registerDatabaseCallback('blixt-internet:server:addCommunity', function(src, data)
    if type(data) ~= 'table' then return { ok = false, message = 'Invalid entry.' } end
    local site = data.site
    if site ~= 'shack' and site ~= 'motorheadz' then return { ok = false, message = 'Unknown board.' } end
    local citizenid = getCitizenId(src)
    if not citizenid then return { ok = false, message = 'Character not found.' } end
    local nickname = cleanText(data.nickname, 40)
    local title = cleanText(data.title, 100)
    local body = cleanText(data.body, 700)
    local imageUrl = site == 'motorheadz' and cleanUrl(data.imageUrl, 512) or nil
    if #nickname < 2 or #title < 3 or #body < 3 then return { ok = false, message = 'Please complete all fields.' } end
    if site == 'motorheadz' and not imageUrl then return { ok = false, message = 'Add a valid http or https image link.' } end
    local recent = MySQL.single.await('SELECT COUNT(*) AS total FROM blixt_internet_community WHERE citizenid = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)', { citizenid })
    if recent and tonumber(recent.total) >= 2 then return { ok = false, message = 'Please wait before posting again.' } end
    MySQL.insert.await('INSERT INTO blixt_internet_community (citizenid, site, nickname, title, body, image_url) VALUES (?, ?, ?, ?, ?, ?)', { citizenid, site, nickname, title, body, imageUrl })
    return { ok = true }
end)

registerDatabaseCallback('blixt-internet:server:createPost', function(src, data)
    data = data or {}
    local citizenid = getCitizenId(src)
    local app = data.app == 'jobs' and 'jobs' or 'daveslist'
    local category = cleanText(data.category, 64)
    local title = cleanText(data.title, 100)
    local body = cleanText(data.body, 2200)
    local imageUrl = cleanUrl(data.imageUrl, 512)
    local price = tonumber(data.price)
    local contactEmail = getEmailForCitizen(citizenid)
    local contactPhone = data.includePhone and getPhoneNumber(src) or nil
    if contactPhone then
        contactPhone = cleanText(contactPhone, 64)
        if contactPhone == '' then contactPhone = nil end
    end

    if not contactEmail then
        return { ok = false, message = 'Create a MOL account first so people can contact you.' }
    end

    if title == '' or body == '' then
        return { ok = false, message = 'Title and description are required.' }
    end

    if not categoryAllowed(app, category) then
        return { ok = false, message = 'Invalid category.' }
    end

    local postingKey = citizenid .. ':' .. app
    if postingInProgress[postingKey] then
        return { ok = false, message = 'Please wait for your previous post.' }
    end
    postingInProgress[postingKey] = true
    local ok, result = pcall(function()
        local maxPosts = app == 'jobs' and Config.Posting.maxActiveJobsPerPlayer or Config.Posting.maxActiveAdsPerPlayer
        local countRow = MySQL.single.await([[SELECT COUNT(*) AS count FROM blixt_internet_posts
            WHERE citizenid = ? AND app = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())]], { citizenid, app })
        if countRow and tonumber(countRow.count) >= maxPosts then
            return { ok = false, message = ('You already have %s active posts.'):format(maxPosts) }
        end

        local cost = math.max(0, math.floor(tonumber(app == 'jobs' and Config.Posting.jobPostCost or Config.Posting.adPostCost) or 0))
        local expireDays = tonumber(data.expireDays) or Config.Posting.defaultExpireDays or 7
        expireDays = math.max(1, math.min(30, math.floor(expireDays)))
        local authorName = getCharacterName(src)
        local reason = app == 'jobs' and 'job_board_post' or 'daveslist_post'

        if not removeMoney(src, cost, reason) then
            return { ok = false, message = ('You need $%s in your bank account.'):format(cost) }
        end

        local inserted, postId = pcall(function()
            return MySQL.insert.await([[INSERT INTO blixt_internet_posts
                (citizenid, author_name, contact_email, contact_phone, app, category, title, body, image_url, price, status, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))]], {
                citizenid, authorName, contactEmail, contactPhone, app, category, title, body, imageUrl, price, 'active', expireDays
            })
        end)

        if not inserted or not postId then
            if cost > 0 then
                local refunded, success = pcall(function()
                    -- Never credit a different character if the player changed characters mid-request.
                    return getCitizenId(src) == citizenid and Bridge.AddMoney(src, 'bank', cost, reason .. '_refund')
                end)
                if not refunded or not success then
                    print(('[blixt-internet] REFUND REQUIRED: posting failed for citizenid %s, bank charge $%s.'):format(citizenid, cost))
                    return { ok = false, message = 'Post failed. Contact server staff about your posting fee.' }
                end
            end
            return { ok = false, message = 'Could not publish your post. Please try again.' }
        end

        return { ok = true, message = 'Post published.' }
    end)
    postingInProgress[postingKey] = nil
    if not ok then
        print('[blixt-internet] Posting failed: unexpected server error.')
        return { ok = false, message = 'Could not publish your post. Please try again.' }
    end
    return result
end)

registerDatabaseCallback('blixt-internet:server:deletePost', function(src, data)
    data = data or {}
    local id = tonumber(data.id)
    if not id then return { ok = false } end

    local citizenid = getCitizenId(src)
    local changed = MySQL.update.await('UPDATE blixt_internet_posts SET status = ? WHERE id = ? AND citizenid = ?', { 'deleted', id, citizenid })
    return { ok = changed and changed > 0 }
end)

RegisterCommand('internetemail', function(src)
    if src == 0 then return end
    local citizenid = getCitizenId(src)
    local email = getEmailForCitizen(citizenid)
    notify(src, email and ('Your MOL email is ' .. email) or 'You do not have a MOL account yet.', email and 'inform' or 'error')
end, false)

RegisterNetEvent('blixt-internet:server:adminAccess', function(requestId)
    local src = source
    if type(requestId) ~= 'number' then return end
    local aceResult = IsPlayerAceAllowed(src, 'blixtinternet.admin')
    TriggerClientEvent('blixt-internet:client:adminAccess', src, requestId, aceResult == true or aceResult == 1)
end)


-- Shared WinDos 95 visual preset, validated and saved server-side.
local themeFile = 'theme-settings.json'
local allowedPresets = { original = true, gradient = true, midnight = true }
local savedTheme = { preset = 'original', policeMdtEnabled = true, requireDialup = true }
local rawTheme = LoadResourceFile(GetCurrentResourceName(), themeFile)
if rawTheme then
    local ok, decoded = pcall(json.decode, rawTheme)
    if ok and type(decoded) == 'table' and allowedPresets[decoded.preset] then
        savedTheme.preset = decoded.preset
        savedTheme.policeMdtEnabled = decoded.policeMdtEnabled ~= false
        savedTheme.requireDialup = decoded.requireDialup ~= false
    end
end

RegisterNetEvent('blixt-internet:server:getTheme', function()
    TriggerClientEvent('blixt-internet:client:themeUpdated', source, savedTheme)
end)

RegisterNetEvent('blixt-internet:server:saveTheme', function(requestId, preset, policeMdtEnabled, requireDialup)
    local src = source
    if type(requestId) ~= 'number' then return end
    local ace = IsPlayerAceAllowed(src, 'blixtinternet.admin')
    if not (ace == true or ace == 1) then
        TriggerClientEvent('blixt-internet:client:themeSaved', src, requestId, false, 'Administrator privileges required.')
        return
    end
    if type(preset) ~= 'string' or not allowedPresets[preset] then
        TriggerClientEvent('blixt-internet:client:themeSaved', src, requestId, false, 'Invalid colour preset.')
        return
    end
    if type(policeMdtEnabled) ~= 'boolean' then policeMdtEnabled = savedTheme.policeMdtEnabled end
    if type(requireDialup) ~= 'boolean' then requireDialup = savedTheme.requireDialup end
    local data = json.encode({ preset = preset, policeMdtEnabled = policeMdtEnabled, requireDialup = requireDialup })
    if not SaveResourceFile(GetCurrentResourceName(), themeFile, data, -1) then
        TriggerClientEvent('blixt-internet:client:themeSaved', src, requestId, false, 'Could not save theme settings.')
        return
    end
    savedTheme.preset = preset
    savedTheme.policeMdtEnabled = policeMdtEnabled
    savedTheme.requireDialup = requireDialup
    TriggerClientEvent('blixt-internet:client:themeUpdated', -1, savedTheme)
    TriggerClientEvent('blixt-internet:client:themeSaved', src, requestId, true, '')
end)

-- Dial-up state is deliberately memory-only: reset when the server restarts.
local dialupConnected = {}
local dialupPending = {}

local function usingComputer(src)
    for _, owner in pairs(activeComputers) do
        if owner == src then return true end
    end
    return false
end

-- Dial-up messages return directly to the requesting client with an explicit response.
-- This avoids indefinite framework callback waits during desktop startup.
local dialupHandlers = {
    dialupStatus = function(src)
        if not usingComputer(src) then return { ok = false, message = 'Computer not open.' } end
        return { ok = true, required = savedTheme.requireDialup, connected =
            not savedTheme.requireDialup or dialupConnected[getCitizenId(src)] == true }
    end,
    dialupBegin = function(src)
        if not usingComputer(src) then return { ok = false, message = 'Computer not open.' } end
        if not savedTheme.requireDialup then return { ok = true, connected = true } end
        local citizenid = getCitizenId(src)
        if dialupConnected[citizenid] then return { ok = true, connected = true } end
        dialupPending[src] = { citizenid = citizenid, started = GetGameTimer() }
        return { ok = true, connected = false }
    end,
    dialupComplete = function(src)
        if not usingComputer(src) then return { ok = false, message = 'Computer not open.' } end
        if not savedTheme.requireDialup then return { ok = true, connected = true } end
        local pending = dialupPending[src]
        if not pending or pending.citizenid ~= getCitizenId(src) then
            return { ok = false, message = 'Connection was interrupted.' }
        end
        if GetGameTimer() - pending.started < 9000 then
            return { ok = false, message = 'The modem is still dialling.' }
        end
        dialupPending[src] = nil
        dialupConnected[pending.citizenid] = true
        return { ok = true, connected = true }
    end,
    dialupCancel = function(src)
        dialupPending[src] = nil
        return { ok = true }
    end
}

RegisterNetEvent('blixt-internet:server:dialupRequest', function(requestId, action)
    local src = source
    if type(requestId) ~= 'number' or requestId < 1 or requestId % 1 ~= 0 then return end
    local handler = type(action) == 'string' and dialupHandlers[action] or nil
    if not handler then
        TriggerClientEvent('blixt-internet:client:dialupReply', src, requestId,
            { ok = false, message = 'Invalid dial-up action.' })
        return
    end
    local ok, result = pcall(handler, src)
    if not ok then
        if Config.Debug then print(('[blixt-internet] Dial-up %s failed: %s'):format(action, tostring(result))) end
        result = { ok = false, message = 'Dial-up service unavailable.' }
    end
    TriggerClientEvent('blixt-internet:client:dialupReply', src, requestId, result)
end)

AddEventHandler('playerDropped', function()
    dialupPending[source] = nil
end)
