Bridge = Bridge or {}

local function debugPrint(...)
    if Config and Config.Debug then
        print('[blixt-internet:bridge]', ...)
    end
end

function Bridge.GetFramework()
    if Config and Config.Framework and Config.Framework ~= 'auto' then
        return Config.Framework
    end

    if GetResourceState('qb-core') == 'started' then return 'qb' end
    if GetResourceState('qbx_core') == 'started' then return 'qbx' end
    if GetResourceState('ox_lib') == 'started' then return 'ox' end
    return 'standalone'
end

if IsDuplicityVersion() then
    local QBCore

    local function getQBCore()
        if QBCore then return QBCore end
        if GetResourceState('qb-core') ~= 'started' then return nil end
        local ok, core = pcall(function()
            return exports['qb-core']:GetCoreObject()
        end)
        if ok then QBCore = core end
        return QBCore
    end

    function Bridge.GetPlayer(src)
        local framework = Bridge.GetFramework()

        if framework == 'qb' then
            local core = getQBCore()
            return core and core.Functions.GetPlayer(src) or nil
        end

        if framework == 'qbx' then
            local ok, player = pcall(function()
                return exports.qbx_core:GetPlayer(src)
            end)
            return ok and player or nil
        end

        local core = getQBCore()
        if core then return core.Functions.GetPlayer(src) end

        if GetResourceState('qbx_core') == 'started' then
            local ok, player = pcall(function()
                return exports.qbx_core:GetPlayer(src)
            end)
            if ok then return player end
        end

        return nil
    end

    function Bridge.Notify(src, message, notifyType, title)
        notifyType = notifyType or 'primary'
        if notifyType == 'inform' then notifyType = 'primary' end

        local framework = Bridge.GetFramework()
        if framework == 'qb' or GetResourceState('qb-core') == 'started' then
            TriggerClientEvent('QBCore:Notify', src, message, notifyType)
            return
        end

        if GetResourceState('ox_lib') == 'started' then
            TriggerClientEvent('ox_lib:notify', src, {
                title = title or 'Computer',
                description = message,
                type = notifyType == 'primary' and 'inform' or notifyType,
                position = Config.Notifications and Config.Notifications.position or 'top-right'
            })
            return
        end

        TriggerClientEvent('chat:addMessage', src, {
            args = { title or 'Computer', message }
        })
    end

    function Bridge.RegisterCallback(name, cb)
        local framework = Bridge.GetFramework()

        if framework == 'qb' or GetResourceState('qb-core') == 'started' then
            local core = getQBCore()
            if core and core.Functions and core.Functions.CreateCallback then
                core.Functions.CreateCallback(name, function(source, reply, ...)
                    local result = cb(source, ...)
                    reply(result)
                end)
                debugPrint('Registered QB callback:', name)
                return
            end
        end

        if GetResourceState('ox_lib') == 'started' and lib and lib.callback then
            lib.callback.register(name, cb)
            debugPrint('Registered ox callback:', name)
            return
        end

        error(('No supported callback system found for %s. Start qb-core or ox_lib before this resource.'):format(name))
    end

    function Bridge.AddMoney(src, account, amount, reason)
        amount = tonumber(amount) or 0
        if amount <= 0 then return true end

        local player = Bridge.GetPlayer(src)
        if player and player.Functions and player.Functions.AddMoney then
            return player.Functions.AddMoney(account or 'bank', amount, reason or 'internet_post_refund') == true
        end

        if GetResourceState('qbx_core') == 'started' then
            local ok, result = pcall(function()
                return exports.qbx_core:AddMoney(src, account or 'bank', amount, reason or 'internet_post_refund')
            end)
            return ok and result == true
        end

        return false
    end

    function Bridge.RemoveMoney(src, account, amount, reason)
        amount = tonumber(amount) or 0
        if amount <= 0 then return true end

        local player = Bridge.GetPlayer(src)
        if player and player.Functions and player.Functions.RemoveMoney then
            return player.Functions.RemoveMoney(account or 'bank', amount, reason or 'internet_post') or false
        end

        if GetResourceState('qbx_core') == 'started' then
            local ok, result = pcall(function()
                return exports.qbx_core:RemoveMoney(src, account or 'bank', amount, reason or 'internet_post')
            end)
            return ok and result or false
        end

        return false
    end
else
    local QBCore

    local function getQBCore()
        if QBCore then return QBCore end
        if GetResourceState('qb-core') ~= 'started' then return nil end
        local ok, core = pcall(function()
            return exports['qb-core']:GetCoreObject()
        end)
        if ok then QBCore = core end
        return QBCore
    end

    function Bridge.Notify(message, notifyType, title)
        notifyType = notifyType or 'primary'
        if notifyType == 'inform' then notifyType = 'primary' end

        local core = getQBCore()
        if core and core.Functions and core.Functions.Notify then
            core.Functions.Notify(message, notifyType)
            return
        end

        if GetResourceState('ox_lib') == 'started' and lib and lib.notify then
            lib.notify({
                title = title or 'Computer',
                description = message,
                type = notifyType == 'primary' and 'inform' or notifyType,
                position = Config.Notifications and Config.Notifications.position or 'top-right'
            })
            return
        end

        TriggerEvent('chat:addMessage', { args = { title or 'Computer', message } })
    end

    function Bridge.CallbackAwait(name, ...)
        local args = { ... }
        local p = promise.new()

        local core = getQBCore()
        if core and core.Functions and core.Functions.TriggerCallback then
            core.Functions.TriggerCallback(name, function(result)
                p:resolve(result)
            end, table.unpack(args))
            return Citizen.Await(p)
        end

        if GetResourceState('ox_lib') == 'started' and lib and lib.callback then
            return lib.callback.await(name, false, table.unpack(args))
        end

        debugPrint('No callback system available for:', name)
        return nil
    end
end
