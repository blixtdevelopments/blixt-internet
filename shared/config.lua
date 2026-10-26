Config = {}

Config.Debug = false

-- Framework support: 'auto', 'qb', 'qbx', or 'standalone'.
Config.Framework = 'qbx'

-- Target support: 'ox_target', 'qb-target', or false to use /usecomputer debug command only.
Config.Target = 'ox_target'

Config.ComputerProps = {
    [`prop_monitor_01a`] = {
        label = 'Use Computer',
        icon = 'fas fa-desktop',

        -- Camera tuning. These are a good starting point and are easy to live-adjust later.
        -- Offsets are relative to the prop entity.
        camOffset = vec3(0.0, -0.72, 0.33),
        lookOffset = vec3(0.0, 0.10, 0.30),
        -- Moved back from the screen so the scripted monitor camera no longer clips into the player's head/hair.
        playerOffset = vec3(0.0, -1.22, -0.05),
        headingOffset = 0.0,
        fov = 33.0,
        transitionMs = 700,

        -- Per-prop NUI placement. This only changes the browser overlay size/position
        -- for this prop, so other computer models can keep their own fit.
        screen = {
            width = '63vw',
            height = '82vh',
            offsetX = '0vw',
            offsetY = '-1vh'
        }
    },
    [`prop_crt_mon_02`] = {
        label = 'Use Computer',
        icon = 'fas fa-desktop',

        -- Camera tuning. These are a good starting point and are easy to live-adjust later.
        -- Offsets are relative to the prop entity.
        camOffset = vec3(0.0, -0.82, 0.23),
        lookOffset = vec3(0.0, 0.10, 0.20),
        playerOffset = vec3(0.0, -1.22, -0.05),
        headingOffset = 0.0,
        fov = 29.0,
        transitionMs = 700,

        screen = {
            width = '58vw',
            height = '83vh',
            offsetX = '0vw',
            offsetY = '-2.5vh'
        }
    },
[`v_corp_desksetb`] = {
    label = 'Use Computer',
    icon = 'fas fa-desktop',

    camOffset = vec3(-0.34, -1.00, 1.13),
    lookOffset = vec3(-0.42, -0.02, 1.10),
    playerOffset = vec3(-0.85, -2.00, 0.10),
    headingOffset = 0.0,
    fov = 22.0,
    transitionMs = 700,

    screen = {
        width = '65.2vw',
        height = '86.2vh',
        offsetX = '-0.4vw',
        offsetY = '-1.0vh'
    }
},
[`prop_monitor_w_large`] = {
    label = 'Use Computer',
    icon = 'fas fa-desktop',

    camOffset = vec3(0.0, -1.18, 0.39),
    lookOffset = vec3(0.0, 0.04, 0.38),

    playerOffset = vec3(0.0, -1.22, -0.05),
    headingOffset = 0.0,
    fov = 31.0,
    transitionMs = 700,

    screen = {
        width = '70vw',
        height = '75vh',
        offsetX = '0.1vw',
        offsetY = '-2.5vh'
    }
},
    [`prop_crt_mon_01`] = {
        label = 'Use Computer',
        icon = 'fas fa-desktop',

        -- Camera tuning. These are a good starting point and are easy to live-adjust later.
        -- Offsets are relative to the prop entity.
        camOffset = vec3(0.0, -0.82, 0.23),
        lookOffset = vec3(0.0, 0.10, 0.20),
        playerOffset = vec3(0.0, -1.22, -0.05),
        headingOffset = 0.0,
        fov = 29.0,
        transitionMs = 700,

        screen = {
            width = '58vw',
            height = '83vh',
            offsetX = '0vw',
            offsetY = '-2.5vh'
        }
    },
    [`prop_monitor_01c`] = {
        label = 'Use Computer',
        icon = 'fas fa-desktop',

        -- Camera tuning. These are a good starting point and are easy to live-adjust later.
        -- Offsets are relative to the prop entity.
        camOffset = vec3(0.0, -0.72, 0.26),
        lookOffset = vec3(0.0, 0.10, 0.26),
        -- Moved back from the screen so the scripted monitor camera no longer clips into the player's head/hair.
        playerOffset = vec3(0.0, -1.22, -0.05),
        headingOffset = 0.0,
        fov = 33.0,
        transitionMs = 700,

        -- Per-prop NUI placement. This only changes the browser overlay size/position
        -- for this prop, so other computer models can keep their own fit.
        screen = {
            width = '63vw',
            height = '76vh',
            offsetX = '-0.3vw',
            offsetY = '-2.6vh'
        }
    },
[`prop_monitor_01d`] = {
    label = 'Use Computer',
    icon = 'fas fa-desktop',

    camOffset = vec3(0.0, -0.72, 0.30),
    lookOffset = vec3(0.0, 0.10, 0.24),
    playerOffset = vec3(0.0, -1.22, -0.05),
    headingOffset = 0.0,
    fov = 33.0,
    transitionMs = 700,

    screen = {
        width = '62vw',
        height = '73.5vh',
        offsetX = '-0.15vw',
        offsetY = '-8.3vh'
    }
},
[`prop_monitor_02`] = {
    label = 'Use Computer',
    icon = 'fas fa-desktop',

    camOffset = vec3(0.0, -0.72, 0.30),
    lookOffset = vec3(0.0, 0.10, 0.26),
    playerOffset = vec3(0.0, -1.22, -0.05),
    headingOffset = 0.0,
    fov = 33.0,
    transitionMs = 700,

    screen = {
        width = '59vw',
        height = '79vh',
        offsetX = '-0.30vw',
        offsetY = '-2.7vh'
    }
},
[`prop_monitor_03b`] = {
    label = 'Use Computer',
    icon = 'fas fa-desktop',

    camOffset = vec3(0.0, -0.95, 0.24),
    lookOffset = vec3(0.0, 0.10, 0.26),
    playerOffset = vec3(0.0, -1.35, -0.05),
    headingOffset = 0.0,
    fov = 33.0,
    transitionMs = 700,

    screen = {
        width = '60.35vw',
        height = '78.35vh',
        offsetX = '0.15vw',
        offsetY = '-6.0vh'
    }
},
[`prop_monitor_li`] = {
    label = 'Use Computer',
    icon = 'fas fa-desktop',

    camOffset = vec3(0.0, -0.82, 0.32),
    lookOffset = vec3(0.0, 0.10, 0.255),
    playerOffset = vec3(0.0, -1.30, -0.05),
    headingOffset = 0.0,
    fov = 33.0,
    transitionMs = 700,

    screen = {
        width = '60vw',
        height = '71.7vh',
        offsetX = '-0.20vw',
        offsetY = '-10.2vh'
    }
},



}

-- Global approved props are usable anywhere. Turn this off and enable zones when you only want cafe PCs.
Config.UseGlobalApprovedProps = true
Config.RestrictToZones = false
Config.AllowedZones = {
    -- {
    --     name = 'internet_cafe',
    --     coords = vec3(-1081.0, -247.0, 37.7),
    --     radius = 30.0
    -- }
}

Config.Animation = {
    -- Uses rpemotes command by default so it matches your existing /e type placement.
    useRpEmotesCommand = true,
    command = 'e type',

    -- Fallback if rpemotes is not present or command is disabled.
    dict = 'anim@heists@prison_heiststation@cop_reactions',
    clip = 'cop_b_idle',
    flag = 49
}

Config.Email = {
    domain = 'mol.com',
    minUsernameLength = 3,
    maxUsernameLength = 24,
    usernamePattern = '^[%w%.%_%-%+]+$', -- Lua pattern, username only. Domain is auto-appended.
    maxSubjectLength = 80,
    maxBodyLength = 12000,
    maxMessagesPerMinute = 5
}

Config.Posting = {
    adPostCost = 0,
    jobPostCost = 0,
    maxActiveAdsPerPlayer = 5,
    maxActiveJobsPerPlayer = 5,
    defaultExpireDays = 7
}

Config.Categories = {
    daveslist = {
        'Vehicles', 'Parts', 'Electronics', 'Property', 'Services', 'Wanted', 'Other'
    },
    jobs = {
        'Hospitality', 'Mechanic', 'Retail', 'Security', 'Government', 'Transport', 'Other'
    }
}

Config.UI = {
    bootSound = true,
    bootTime = 2400,
    title = 'WinDos Net Terminal',
    subtitle = 'Public access gateway',
    wallpaperLogo = true
}

-- Optional police MDT desktop application. Access is checked through the MDT's
-- IsLEOJob export, so any job using the configured LEO job type/group can see it.
Config.PoliceMDT = {
    enabled = true,
    resource = 'ps-mdt',
    label = 'Police MDT'
}

Config.Notifications = {
    position = 'top-right'
}

-- DarkMarket is an unlisted website. The police restriction is also adjustable in Administration.
Config.DarkMarket = {
    restrictedJobType = 'leo',
    discoveryKeywords = { 'private exchange', 'blackmarket', 'black market', 'hacking', 'hacker', 'nitrous' }
}
