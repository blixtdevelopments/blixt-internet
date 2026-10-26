-- Fresh database for blixt-internet. Older internetcafe_* tables are intentionally not migrated.
-- No game/resource tables outside the known legacy list are touched.
BlixtInternetDB = { ready = false }

local definitions = {
    [[CREATE TABLE IF NOT EXISTS `blixt_internet_accounts` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `citizenid` VARCHAR(64) NOT NULL,
            `email` VARCHAR(96) NOT NULL,
            `display_name` VARCHAR(96) NOT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_citizenid` (`citizenid`),
            UNIQUE KEY `uniq_email` (`email`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `blixt_internet_mail` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `sender_citizenid` VARCHAR(64) NOT NULL,
            `sender_email` VARCHAR(96) NOT NULL,
            `sender_name` VARCHAR(96) NOT NULL,
            `recipient_email` VARCHAR(96) NOT NULL,
            `subject` VARCHAR(120) NOT NULL,
            `body` TEXT NOT NULL,
            `attachment_url` VARCHAR(512) NULL,
            `is_read` TINYINT(1) NOT NULL DEFAULT 0,
            `deleted_by_sender` TINYINT(1) NOT NULL DEFAULT 0,
            `deleted_by_recipient` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_recipient` (`recipient_email`, `created_at`),
            KEY `idx_sender` (`sender_email`, `created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `blixt_internet_posts` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `citizenid` VARCHAR(64) NOT NULL,
            `author_name` VARCHAR(96) NOT NULL,
            `contact_email` VARCHAR(96) NULL,
            `contact_phone` VARCHAR(64) NULL,
            `app` VARCHAR(32) NOT NULL,
            `category` VARCHAR(64) NOT NULL,
            `title` VARCHAR(100) NOT NULL,
            `body` TEXT NOT NULL,
            `image_url` VARCHAR(512) NULL,
            `price` INT NULL,
            `status` VARCHAR(20) NOT NULL DEFAULT 'active',
            `expires_at` DATETIME NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_app_status` (`app`, `status`, `created_at`),
            KEY `idx_citizenid` (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `blixt_internet_community` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `citizenid` VARCHAR(64) NOT NULL,
        `site` VARCHAR(24) NOT NULL,
        `nickname` VARCHAR(40) NOT NULL,
        `title` VARCHAR(100) NOT NULL,
        `body` TEXT NOT NULL,
        `image_url` VARCHAR(512) NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_site_created` (`site`, `created_at`),
        KEY `idx_player_created` (`citizenid`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `blixt_internet_truth_topics` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `citizenid` VARCHAR(64) NOT NULL,
        `category` VARCHAR(40) NOT NULL,
        `nickname` VARCHAR(40) NOT NULL,
        `title` VARCHAR(120) NOT NULL,
        `body` TEXT NOT NULL,
        `image_url` VARCHAR(512) NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_category_created` (`category`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `blixt_internet_truth_replies` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `topic_id` INT NOT NULL,
        `citizenid` VARCHAR(64) NOT NULL,
        `nickname` VARCHAR(40) NOT NULL,
        `body` TEXT NOT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_topic_created` (`topic_id`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS blixt_internet_dark_accounts (
            id INT AUTO_INCREMENT PRIMARY KEY, citizenid VARCHAR(64) NOT NULL, character_name VARCHAR(96) NOT NULL,
            handle VARCHAR(24) NOT NULL UNIQUE, salt VARCHAR(36) NOT NULL, password_hash CHAR(64) NOT NULL,
            secret_question VARCHAR(32) NULL, secret_salt VARCHAR(36) NULL, secret_hash CHAR(64) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_dark_citizenid (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS blixt_internet_dark_boards (
            id INT AUTO_INCREMENT PRIMARY KEY, account_id INT NOT NULL, title VARCHAR(70) NOT NULL,
            description VARCHAR(180) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS blixt_internet_dark_topics (
            id INT AUTO_INCREMENT PRIMARY KEY, board_id INT NOT NULL, account_id INT NOT NULL,
            title VARCHAR(120) NOT NULL, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY (board_id, created_at), KEY (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS blixt_internet_dark_replies (
            id INT AUTO_INCREMENT PRIMARY KEY, topic_id INT NOT NULL, account_id INT NOT NULL,
            body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY (topic_id, created_at), KEY (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS blixt_internet_dark_ads (
            id INT AUTO_INCREMENT PRIMARY KEY, account_id INT NOT NULL, kind VARCHAR(8) NOT NULL,
            category VARCHAR(40) NOT NULL, title VARCHAR(120) NOT NULL, body TEXT NOT NULL,
            price INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY (kind, created_at), KEY (account_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS blixt_internet_dark_messages (
            id INT AUTO_INCREMENT PRIMARY KEY, sender_id INT NOT NULL, recipient_id INT NOT NULL,
            subject VARCHAR(120) NOT NULL, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY (sender_id, created_at), KEY (recipient_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS blixt_internet_admin_audit (
            id INT AUTO_INCREMENT PRIMARY KEY, admin_citizenid VARCHAR(64) NOT NULL,
            item_type VARCHAR(40) NOT NULL, item_id INT NOT NULL, action VARCHAR(24) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
}

local legacyTables = {
    'internetcafe_accounts',
    'internetcafe_mail',
    'internetcafe_posts',
    'internetcafe_community',
    'internetcafe_truth_topics',
    'internetcafe_truth_replies',
    'internetcafe_dark_accounts',
    'internetcafe_dark_boards',
    'internetcafe_dark_topics',
    'internetcafe_dark_replies',
    'internetcafe_dark_ads',
    'internetcafe_dark_messages',
    'internetcafe_admin_audit',
}

local function initialize()
    -- Do not touch legacy data until the complete new schema exists.
    for _, statement in ipairs(definitions) do
        MySQL.query.await(statement)
    end

    -- Cleanup is automatic but effectively one-time: after removal the lookup is empty.
    -- Only exact, known table names belonging to the previous resource qualify.
    local markers = {}
    for _ = 1, #legacyTables do markers[#markers + 1] = '?' end
    local rows = MySQL.query.await(
        'SELECT TABLE_NAME AS tableName FROM INFORMATION_SCHEMA.TABLES ' ..
        'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (' .. table.concat(markers, ',') .. ')',
        legacyTables
    ) or {}
    local present = {}
    for _, row in ipairs(rows) do present[row.tableName or row.TABLE_NAME] = true end
    local dropped = 0
    for _, name in ipairs(legacyTables) do
        if present[name] then
            -- Every name comes exclusively from the hardcoded allowlist above.
            local ok, err = pcall(function()
                MySQL.query.await(('DROP TABLE `%s`'):format(name))
            end)
            if ok then
                dropped = dropped + 1
            else
                print(('[blixt-internet] Could not remove old table %s: %s'):format(name, tostring(err)))
            end
        end
    end
    BlixtInternetDB.ready = true
    if dropped > 0 then
        print(('[blixt-internet] New database ready. Removed %d old Internet Cafe table(s).'):format(dropped))
    else
        print('[blixt-internet] Database ready.')
    end
end

MySQL.ready(function()
    local ok, err = pcall(initialize)
    if not ok then
        print(('[blixt-internet] Database initialization failed: %s'):format(tostring(err)))
        return
    end
end)
