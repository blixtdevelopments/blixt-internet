local isUsingComputer = false
local activeCam = nil
local activeEntity = nil
local activeComputerKey = nil
local currentConfig = nil
local mdtOpenFromComputer = false

local function debugPrint(...)
    if Config.Debug then
        print('[blixt-internet:client]', ...)
    end
end

local function notify(message, notifyType)
    Bridge.Notify(message, notifyType, 'Computer')
end

local function getPoliceMdtResource()
    return (Config.PoliceMDT and Config.PoliceMDT.resource) or 'ps-mdt'
end

local function hasPoliceMdtAccess()
    if Config.PoliceMDT and Config.PoliceMDT.enabled == false then return false end

    local resource = getPoliceMdtResource()
    if GetResourceState(resource) ~= 'started' then return false end

    local ok, isLeo = pcall(function()
        return exports[resource]:IsLEOJob()
    end)

    return ok and isLeo == true
end

local function tableKeys(tbl)
    local keys = {}
    for k in pairs(tbl) do keys[#keys + 1] = k end
    return keys
end

local function isInsideAllowedZone(coords)
    if not Config.RestrictToZones then return true end
    for _, zone in ipairs(Config.AllowedZones or {}) do
        if #(coords - zone.coords) <= zone.radius then
            return true
        end
    end
    return false
end

local function getComputerConfig(entity)
    if not entity or entity == 0 or not DoesEntityExist(entity) then return nil end
    local model = GetEntityModel(entity)
    return Config.ComputerProps[model], model
end

local function makeComputerKey(entity)
    local coords = GetEntityCoords(entity)
    local model = GetEntityModel(entity)
    return ('%s:%.2f:%.2f:%.2f'):format(model, coords.x, coords.y, coords.z)
end

local function loadAnimDict(dict)
    if HasAnimDictLoaded(dict) then return true end
    RequestAnimDict(dict)
    local timeout = GetGameTimer() + 2500
    while not HasAnimDictLoaded(dict) and GetGameTimer() < timeout do
        Wait(10)
    end
    return HasAnimDictLoaded(dict)
end

local function startTypingAnim()
    if Config.Animation.useRpEmotesCommand and Config.Animation.command then
        ExecuteCommand(Config.Animation.command)
        return
    end

    if loadAnimDict(Config.Animation.dict) then
        TaskPlayAnim(PlayerPedId(), Config.Animation.dict, Config.Animation.clip, 3.0, 3.0, -1, Config.Animation.flag or 49, 0.0, false, false, false)
    end
end

local function stopTypingAnim()
    if Config.Animation.useRpEmotesCommand then
        ExecuteCommand('e c')
        ExecuteCommand('emotecancel')
    end
    ClearPedTasks(PlayerPedId())
end

local function focusPlayerAtComputer(entity, cfg)
    local ped = PlayerPedId()
    local playerPos = GetOffsetFromEntityInWorldCoords(entity, cfg.playerOffset.x, cfg.playerOffset.y, cfg.playerOffset.z)
    local entityCoords = GetEntityCoords(entity)

    SetEntityCoordsNoOffset(ped, playerPos.x, playerPos.y, playerPos.z, false, false, false)
    TaskTurnPedToFaceCoord(ped, entityCoords.x, entityCoords.y, entityCoords.z, 650)
    Wait(650)

    local heading = GetEntityHeading(entity) + (cfg.headingOffset or 0.0)
    SetEntityHeading(ped, heading)
end

local function createComputerCam(entity, cfg)
    local camPos = GetOffsetFromEntityInWorldCoords(entity, cfg.camOffset.x, cfg.camOffset.y, cfg.camOffset.z)
    local lookPos = GetOffsetFromEntityInWorldCoords(entity, cfg.lookOffset.x, cfg.lookOffset.y, cfg.lookOffset.z)

    activeCam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(activeCam, camPos.x, camPos.y, camPos.z)
    PointCamAtCoord(activeCam, lookPos.x, lookPos.y, lookPos.z)
    SetCamFov(activeCam, cfg.fov or 35.0)
    SetCamActive(activeCam, true)
    RenderScriptCams(true, true, cfg.transitionMs or 700, true, true)
end

local function destroyComputerCam()
    if activeCam then
        RenderScriptCams(false, true, 450, true, true)
        Wait(450)
        DestroyCam(activeCam, false)
        activeCam = nil
    else
        RenderScriptCams(false, true, 450, true, true)
    end
end

local function restoreComputerCam()
    if not activeCam then return end
    SetCamActive(activeCam, true)
    RenderScriptCams(true, true, 250, true, true)
end

local function resumeComputerFromMdt()
    if not mdtOpenFromComputer then return end
    mdtOpenFromComputer = false

    if not isUsingComputer then return end

    restoreComputerCam()
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'resume',
        policeMdt = {
            available = hasPoliceMdtAccess(),
            label = (Config.PoliceMDT and Config.PoliceMDT.label) or 'Police MDT'
        }
    })
end

local function closeComputer()
    if not isUsingComputer then return end

    TriggerServerEvent('blixt-internet:server:darkLogout')
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })

    destroyComputerCam()
    stopTypingAnim()

    if activeComputerKey then
        TriggerServerEvent('blixt-internet:server:releaseComputer', activeComputerKey)
    end

    isUsingComputer = false
    activeEntity = nil
    activeComputerKey = nil
    currentConfig = nil
end

local function openComputer(entity)
    if isUsingComputer then return end
    if not entity or entity == 0 or not DoesEntityExist(entity) then return end

    local cfg, model = getComputerConfig(entity)
    if not cfg then return end

    local coords = GetEntityCoords(entity)
    if not Config.UseGlobalApprovedProps and not Config.RestrictToZones then
        notify('This terminal is not configured for public access.', 'error')
        return
    end

    if not isInsideAllowedZone(coords) then
        notify('This terminal is not connected to the public network.', 'error')
        return
    end

    local computerKey = makeComputerKey(entity)
    local locked = Bridge.CallbackAwait('blixt-internet:server:claimComputer', computerKey)
    if not locked then
        notify('Someone is already using this computer.', 'error')
        return
    end

    isUsingComputer = true
    activeEntity = entity
    activeComputerKey = computerKey
    currentConfig = cfg

    focusPlayerAtComputer(entity, cfg)
    FreezeEntityPosition(PlayerPedId(), true)
    Wait(50)
    FreezeEntityPosition(PlayerPedId(), false)

    startTypingAnim()
    createComputerCam(entity, cfg)

    local settle = (cfg.transitionMs or 700) + 150
    Wait(settle)
    if not isUsingComputer or activeEntity ~= entity then return end
    SetNuiFocus(true, true)
    TriggerServerEvent('blixt-internet:server:getTheme')
    SendNUIMessage({
        action = 'open',
        config = {
            title = Config.UI.title,
            subtitle = Config.UI.subtitle,
            domain = Config.Email.domain,
            bootSound = Config.UI.bootSound,
            bootTime = Config.UI.bootTime,
            wallpaperLogo = Config.UI.wallpaperLogo,
            categories = Config.Categories,
            screen = cfg.screen or Config.UI.screen,
            policeMdt = {
                available = hasPoliceMdtAccess(),
                label = (Config.PoliceMDT and Config.PoliceMDT.label) or 'Police MDT'
            }
        }
    })
end

local function addTargets()
    local models = tableKeys(Config.ComputerProps)
    if #models == 0 then return end

    if Config.Target == 'ox_target' then
        exports.ox_target:addModel(models, {
            {
                name = 'blixt_internet_use',
                icon = 'fa-solid fa-desktop',
                label = 'Use Computer',
                distance = 1.8,
                canInteract = function(entity)
                    return not isUsingComputer and getComputerConfig(entity) ~= nil and isInsideAllowedZone(GetEntityCoords(entity))
                end,
                onSelect = function(data)
                    openComputer(data.entity)
                end
            }
        })
    elseif Config.Target == 'qb-target' then
        exports['qb-target']:AddTargetModel(models, {
            options = {
                {
                    icon = 'fas fa-desktop',
                    label = 'Use Computer',
                    action = function(entity)
                        openComputer(entity)
                    end,
                    canInteract = function(entity)
                        return not isUsingComputer and getComputerConfig(entity) ~= nil and isInsideAllowedZone(GetEntityCoords(entity))
                    end
                }
            },
            distance = 1.8
        })
    end
end

local function getClosestComputer()
    local pedCoords = GetEntityCoords(PlayerPedId())
    local closest, closestDist
    for model in pairs(Config.ComputerProps) do
        local entity = GetClosestObjectOfType(pedCoords.x, pedCoords.y, pedCoords.z, 2.0, model, false, false, false)
        if entity and entity ~= 0 then
            local dist = #(pedCoords - GetEntityCoords(entity))
            if not closestDist or dist < closestDist then
                closest = entity
                closestDist = dist
            end
        end
    end
    return closest
end

RegisterCommand('usecomputer', function()
    if not Config.Debug then return end
    local entity = getClosestComputer()
    if entity then
        openComputer(entity)
    else
        notify('No approved computer prop nearby.', 'error')
    end
end, false)

RegisterNUICallback('close', function(_, cb)
    closeComputer()
    cb({ ok = true })
end)

RegisterNUICallback('openPoliceMDT', function(_, cb)
    if not isUsingComputer then
        cb({ ok = false, message = 'Computer session is no longer active.' })
        return
    end

    if not hasPoliceMdtAccess() then
        cb({ ok = false, message = 'Police MDT access denied.' })
        return
    end

    local resource = getPoliceMdtResource()
    mdtOpenFromComputer = true

    SendNUIMessage({ action = 'suspend' })
    SetNuiFocus(false, false)
    Wait(0)

    local ok, err = pcall(function()
        exports[resource]:OpenMDT({
            fromComputer = true,
            sourceResource = GetCurrentResourceName(),
            -- Pass the exact active prop's existing WinDos screen profile through
            -- to ps-mdt so its NUI can occupy the same physical monitor area.
            screen = (currentConfig and currentConfig.screen) or (Config.UI and Config.UI.screen) or nil
        })
    end)

    if not ok then
        debugPrint('Failed to open police MDT:', err)
        resumeComputerFromMdt()
        cb({ ok = false, message = 'Police MDT failed to open.' })
        return
    end

    local openOk, isOpen = pcall(function()
        return exports[resource]:IsMDTOpen()
    end)

    if not openOk or not isOpen then
        resumeComputerFromMdt()
        cb({ ok = false, message = 'Police MDT could not be opened.' })
        return
    end

    cb({ ok = true })
end)

-- The browser waits for the specific reply to its request; no cached permission flags.
local adminRequestId = 0
local pendingAdmin = {}

RegisterNetEvent('blixt-internet:client:adminAccess', function(requestId, allowed)
    local reply = pendingAdmin[requestId]
    if not reply then return end
    pendingAdmin[requestId] = nil
    local result = { ok = true, allowed = allowed == true or allowed == 1 }
    reply(result)
end)

RegisterNUICallback('checkAdministration', function(_, cb)
    if not isUsingComputer then
        cb({ ok = false, message = 'Computer session is no longer active.' })
        return
    end
    adminRequestId = adminRequestId + 1
    local id = adminRequestId
    pendingAdmin[id] = cb
    TriggerServerEvent('blixt-internet:server:adminAccess', id)
    SetTimeout(4000, function()
        if pendingAdmin[id] then
            pendingAdmin[id] = nil
            cb({ ok = false, message = 'Administration service did not respond.' })
        end
    end)
end)

local themeSaveId = 0
local pendingThemeSave = {}

RegisterNetEvent('blixt-internet:client:themeUpdated', function(theme)
    SendNUIMessage({ action = 'themeUpdated', theme = theme })
end)

RegisterNetEvent('blixt-internet:client:themeSaved', function(requestId, ok, message)
    local reply = pendingThemeSave[requestId]
    if not reply then return end
    pendingThemeSave[requestId] = nil
    reply({ ok = ok == true or ok == 1, message = message })
end)

RegisterNUICallback('saveComputerTheme', function(data, cb)
    if not isUsingComputer then
        cb({ ok = false, message = 'Computer session is no longer active.' })
        return
    end
    themeSaveId = themeSaveId + 1
    local id = themeSaveId
    pendingThemeSave[id] = cb
    TriggerServerEvent('blixt-internet:server:saveTheme', id, data.preset, data.policeMdtEnabled, data.requireDialup)
    SetTimeout(4000, function()
        if pendingThemeSave[id] then
            pendingThemeSave[id] = nil
            cb({ ok = false, message = 'The server did not respond.' })
        end
    end)
end)

-- Dedicated reply path keeps dial-up independent of framework callback availability.
local dialupRequestId = 0
local pendingDialup = {}

RegisterNetEvent('blixt-internet:client:dialupReply', function(requestId, result)
    local reply = pendingDialup[requestId]
    if not reply then return end
    pendingDialup[requestId] = nil
    reply(result or { ok = false, message = 'No dial-up response.' })
end)

for _, action in ipairs({'dialupStatus', 'dialupBegin', 'dialupComplete', 'dialupCancel'}) do
    RegisterNUICallback(action, function(_, cb)
        if not isUsingComputer then
            cb({ ok = false, message = 'Computer not open.' })
            return
        end
        dialupRequestId = dialupRequestId + 1
        local requestId = dialupRequestId
        pendingDialup[requestId] = cb
        TriggerServerEvent('blixt-internet:server:dialupRequest', requestId, action)
        SetTimeout(5000, function()
            local reply = pendingDialup[requestId]
            if not reply then return end
            pendingDialup[requestId] = nil
            reply({ ok = false, message = 'Dial-up service did not respond.' })
        end)
    end)
end

RegisterNUICallback('getSession', function(_, cb)
    local data = Bridge.CallbackAwait('blixt-internet:server:getSession')
    cb(data or { ok = false })
end)

RegisterNUICallback('registerEmail', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:registerEmail', data) or { ok = false })
end)

RegisterNUICallback('sendEmail', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:sendEmail', data) or { ok = false })
end)

RegisterNUICallback('getMail', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:getMail', data) or { ok = false })
end)

RegisterNUICallback('markMailRead', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:markMailRead', data) or { ok = false })
end)

RegisterNUICallback('searchWeb', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:searchWeb', data) or { ok = false })
end)

RegisterNUICallback('getPublicPost', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:getPublicPost', data) or { ok = false })
end)

RegisterNUICallback('getPosts', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:getPosts', data) or { ok = false })
end)

RegisterNUICallback('getCommunity', function(data, cb)
    if not isUsingComputer then return cb({ ok = false }) end
    cb(Bridge.CallbackAwait('blixt-internet:server:getCommunity', data) or { ok = false })
end)

RegisterNUICallback('addCommunity', function(data, cb)
    if not isUsingComputer then return cb({ ok = false }) end
    cb(Bridge.CallbackAwait('blixt-internet:server:addCommunity', data) or { ok = false })
end)

for _, action in ipairs({'truthTopics','truthTopic','truthCreate','truthReply'}) do
    RegisterNUICallback(action, function(data, cb)
        if not isUsingComputer then return cb({ok=false,message='Computer not open.'}) end
        cb(Bridge.CallbackAwait('blixt-internet:server:' .. action, data) or {ok=false})
    end)
end

RegisterNUICallback('createPost', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:createPost', data) or { ok = false })
end)

RegisterNUICallback('deletePost', function(data, cb)
    cb(Bridge.CallbackAwait('blixt-internet:server:deletePost', data) or { ok = false })
end)

for _, action in ipairs({'darkmarket','darkmarketAdmin'}) do
    RegisterNUICallback(action, function(data, cb)
        if not isUsingComputer then return cb({ok=false,message='Computer not open.'}) end
        cb(Bridge.CallbackAwait('blixt-internet:server:' .. action, data) or {ok=false})
    end)
end

local policeMdtResource = getPoliceMdtResource()

AddEventHandler(policeMdtResource .. ':client:closed', function(context)
    if not mdtOpenFromComputer then return end
    if not (context and context.fromComputer == true) then return end
    resumeComputerFromMdt()
end)

AddEventHandler(policeMdtResource .. ':client:externalViewClosed', function(context)
    if not mdtOpenFromComputer then return end
    if not (context and context.fromComputer == true) then return end
    resumeComputerFromMdt()
end)

CreateThread(function()
    Wait(1000)
    addTargets()
end)

CreateThread(function()
    while true do
        if isUsingComputer and not mdtOpenFromComputer then
            DisableControlAction(0, 1, true) -- look left/right
            DisableControlAction(0, 2, true) -- look up/down
            DisableControlAction(0, 30, true)
            DisableControlAction(0, 31, true)
            DisableControlAction(0, 32, true)
            DisableControlAction(0, 33, true)
            DisableControlAction(0, 34, true)
            DisableControlAction(0, 35, true)
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
            DisableControlAction(0, 200, true)
            if IsDisabledControlJustReleased(0, 200) then
                closeComputer()
            end
            Wait(0)
        else
            Wait(700)
        end
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource == getPoliceMdtResource() and mdtOpenFromComputer then
        resumeComputerFromMdt()
        return
    end

    if resource ~= GetCurrentResourceName() then return end
    if isUsingComputer then
        SetNuiFocus(false, false)
        destroyComputerCam()
        stopTypingAnim()
    end
end)
