fx_version 'cerulean'
game 'gta5'

name 'blixt-internet'
author 'Blixt'
description 'Windows 95 computer and 1995 internet experience'
version '2.0.0'

lua54 'yes'

shared_scripts {
    'shared/config.lua',
    'shared/bridge.lua'
}

client_scripts {
    'client/main.lua'
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/database.lua',
    'server/main.lua',
    'server/darkmarket.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/main.css',
    'html/css/darkmarket.css',
    'html/js/app.js',
    'html/js/darkmarket.js',
    'html/assets/icons/custom-*.png',
    'html/assets/cursors/*.png',
    'html/assets/audio/windosStartup.ogg',
    'html/assets/audio/dialup.mp3',
    'html/assets/images/server-logo.png',
    'html/assets/images/woohoo-header.webp',
    'html/assets/images/burger-shot-1995.gif',
    'html/assets/images/daveslist/*.webp',
    'html/assets/images/daveslist/*.gif',
    'html/assets/images/darkmarket/*.png',
    'html/assets/images/mol-logo.png',
    'html/assets/images/mol/*.png',
    'html/assets/images/jobnet-logo.png',
    'html/assets/images/jobnet/*.png',
    'html/assets/images/gateways/*.svg',
    'html/assets/images/computershack/*.webp',
    'html/assets/images/computershack/*.gif',
    'html/assets/images/motorheadz/*.webp',
    'html/assets/images/truthfiles/*.webp',
}

dependencies {
    'oxmysql'
}

-- Optional supported resources:
-- qb-core / qbx_core
-- qb-target / ox_target
