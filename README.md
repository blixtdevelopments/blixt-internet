# Blixt Internet

**Version 2.0.0**  
A Windows 95-style computer and 1995 internet system for FiveM.

Players use computers in the game world to browse websites, send mail, post classifieds, find work and join online discussions. The interface runs inside the in-game computer and is wired to 10 gta native props, with no external website required.


## Requirements

- FiveM server running **Qbox** (`qbx_core`) or **QB-Core** (`qb-core`)
- **oxmysql** and a working MySQL database
- **ox_target** or **qb-target** to interact with computer props
- Callback support from the framework or **ox_lib** (Qbox setups should have ox_lib started)

Optional: **ps-mdt** for the police MDT desktop shortcut, and rpemotes for the typing animation. Neither is required for the websites.

## Install

1. Place the resource in your FiveM resources directory with the exact folder name **`blixt-internet`**.
2. Open `shared/config.lua`. The included defaults are `Config.Framework = 'qbx'` and `Config.Target = 'ox_target'`. Change these for your server if needed.
3. Ensure your framework, oxmysql and chosen target resource start before Blixt Internet.
4. Add # add_ace group.admin blixtinternet.admin allow # to server cfg
5. Add `ensure blixt-internet` to `server.cfg` and start the server.

Example order for Qbox and ox_target:

```cfg
ensure oxmysql
ensure ox_lib
ensure qbx_core
ensure ox_target
ensure blixt-internet
```


## Administrator access

Add the following ACE permission to the group or principal used by your admins:

```cfg
add_ace group.admin blixtinternet.admin allow
```

Admin settings are found at **Control Panel → Administration** on a computer. Admin Mode reveals player and character information and adds deletion controls to supported user-generated content. Private MOL emails are excluded.

See [Administration](docs/ADMINISTRATION.md) for settings, police access and moderation.


## Support

Blixt Developments: https://discord.gg/TFE4a3D7m4

See [LICENSE](LICENSE) for licensing terms.
