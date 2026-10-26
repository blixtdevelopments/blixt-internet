# Administration

## Permissions

In `server.cfg`, grant the ACE permission to your actual admin group:

```cfg
add_ace group.admin blixtinternet.admin allow
```

Replace `group.admin` if your server uses a different admin principal. Restart the server or refresh permissions after changing the ACE configuration.

Authorised staff can open **Control Panel → Administration** in WinDos 95.

## Admin tabs

| Tab | Settings |
| --- | --- |
| **Appearance** | Server-wide Windows 95 colour preset |
| **Internet** | Turn mandatory dial-up on or off |
| **Police MDT** | Show/hide the supported MDT shortcut |
| **DarkMarket** | Toggle Admin Mode, allow or block LEO jobs from DarkMarket |

The DarkMarket police option is **off by default**. The server checks the framework job `type` against `leo` (or `Config.DarkMarket.restrictedJobType`) rather than relying on department names. Admin ACE permission **does not bypass the police restriction**.

## Admin Mode and moderation

Enable **Admin Mode while browsing** under the DarkMarket tab to inspect supported user-generated content in public websites and DarkMarket. The extra information includes the character's name, permanent character identifier and current **Server ID** if online. Server IDs change when players reconnect.

Authorised staff can remove eligible public listings, community posts, Truth Files topics and replies, and DarkMarket boards, discussions, replies and classifieds. Admin deletion actions are recorded in `blixt_internet_admin_audit`.

**Private MOL emails are excluded from Admin Mode.** Admin Mode is a moderation tool for supported posted content, not an inbox reader. DarkMarket member-to-member private messaging is separate from public-post moderation.

## DarkMarket accounts

Players choose anonymous handles and passwords. Multiple handles can belong to one FiveM character. Each account remains linked to the character internally so authorised admins can identify the owner of supported posts.

Password recovery uses an account's selected security question and answer, **not MOL email**. Older accounts created before the recovery system may not have a recovery question. A player may register a new handle on the same character instead.

The reserved `thetruth` profile has an empty Tasks area for a future expansion. There is no mission or NPC black-market purchase feature in V2.0.

## Server files

- `theme-settings.json`: visual preset, dial-up requirement, and MDT visibility
- `darkmarket-settings.json`: whether LEO jobs can access DarkMarket
- `shared/config.lua`: default framework, target, model, email, posting and other options

Do not edit the runtime JSON settings while the resource is running; use Administration or stop the resource first.
