const axios = require('axios');

module.exports = {
name: 'menu',
description: 'Show available bot commands',
aliases: ['help', 'cmdlist', 'commands'],

async execute(sock, m) {    
    const prefix = global.BOT_PREFIX || '.';    
    
    const now = new Date();
    
    const date = now.toLocaleDateString('en-GB', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric',
        timeZone: 'Africa/Nairobi'
    });
    
    const time = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true,
        timeZone: 'Africa/Accra'
    });
    
    const botOwner = global.ownerName  || 'ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐';
    
    const user = m.pushName || m.sender?.split('@')[0] || 'User';
    
    const menuText = `

┌─ム ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐
│ ᴏᴡɴᴇʀ: ${botOwner}
│ ᴜsᴇʀ: ${user}
│ ᴅᴀᴛᴇ: ${date}
│ ᴛɪᴍᴇ: ${time} (GMT)
│ ᴘʀᴇғɪx: ${prefix}
╰──────────────────╯

┌─ム ᴀᴠᴀɪʟᴀʙʟᴇ ᴄᴏᴍᴍᴀɴᴅs
│
├─ム *ɢᴇɴᴇʀᴀʟ*
│ ᪣ ${prefix}ᴀʟɪᴠᴇ
│ ᪣ ${prefix}ᴘɪɴɢ
│ ᪣ ${prefix}ᴜᴘᴛɪᴍᴇ
│ ᪣ ${prefix}ᴏᴡɴᴇʀ
│ ᪣ ${prefix}ᴍᴇɴᴜ2
│
├─ム *ᴅᴏᴡɴʟᴏᴀᴅᴇʀs*
│ ᪣ ${prefix}ᴛɪᴋᴛᴏᴋ / ${prefix}ᴛᴛ
│ ᪣ ${prefix}ʏᴛᴍᴘ3
│ ᪣ ${prefix}ɪɢ
│
├─ム *ᴛᴏᴏʟs*
│ ᪣ ${prefix}sᴛɪᴄᴋᴇʀ
│ ᪣ ${prefix}ᴏᴄʀ
│ ᪣ ${prefix}ᴛᴛs
│ ᪣ ${prefix}ᴘᴏʟʟ
│ ᪣ ${prefix}sʜᴀᴢᴀᴍ
│
├─ム *ᴀɪ*
│ ᪣ ${prefix}ᴀɪ
│ ᪣ ${prefix}ᴀɪ-sᴇᴀʀᴄʜ
│ ᪣ ${prefix}ᴀɪᴠ
│ ᪣ ${prefix}ɢᴇɴ
│
├─ム *ғᴜɴ*
│ ᪣ ${prefix}ʙʟᴜᴇ
│
├─ム *ɢʀᴏᴜᴘ*
│ ᪣ ${prefix}ᴛᴀɢᴀʟʟ
│ ᪣ ${prefix}ᴛᴀɢᴀʟʟ1
│ ᪣ ${prefix}ᴛᴀɢᴍᴇ
│ ᪣ ${prefix}ᴄᴏᴜᴘʟᴇᴘᴘ
│ ᪣ ${prefix}ɢʀᴏᴜᴘ
│
├─ム *sᴛᴀᴛᴜs*
│ ᪣ ${prefix}ɢsᴛᴀᴛᴜs
│
├─ム *ᴄʜᴀɴɴᴇʟ*
│ ᪣ ${prefix}ᴄʜᴀɴɴᴇʟɪᴅ
│
├─ム *ᴀᴅᴍɪɴ*
│ ᪣ ${prefix}ᴋɪᴄᴋ
│
╰─────────◆────────╯

> 「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」
`.trim();

    try {    
        const imageBuffer = (await axios.get(global.menuImage, { responseType: 'arraybuffer' })).data;    
        
        await m.reply(imageBuffer, { 
            caption: menuText,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363404317544295@newsletter',
                    newsletterName: 'ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」',
                    serverMessageId: 1
                }
            }
        });
        
    } catch (err) {    
        console.error('Menu error:', err);    
        return;
    }    
}

};
