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
        
        const botOwner = global.ownerName || 'ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐';
        const user = m.pushName || m.sender?.split('@')[0] || 'User';
        const totalPlugins = 54;
        
        const menuText = `

┌─ム ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐
│ ᴏᴡɴᴇʀ: ${botOwner}
│ ᴜsᴇʀ: ${user}
│ ᴅᴀᴛᴇ: ${date}
│ ᴛɪᴍᴇ: ${time} (GMT)
│ ᴘʀᴇғɪx: ${prefix}
│ ᴘʟᴜɢɪɴs: ${totalPlugins}
╰──────────────────╯

┌─ム ᴀᴠᴀɪʟᴀʙʟᴇ ᴄᴏᴍᴍᴀɴᴅs
│
├─ム *ɢᴇɴᴇʀᴀʟ*
│ ᪣ ${prefix}ᴀʟɪᴠᴇ
│ ᪣ ${prefix}ᴘɪɴɢ
│ ᪣ ${prefix}ᴜᴘᴛɪᴍᴇ
│ ᪣ ${prefix}ᴏᴡɴᴇʀ
│ ᪣ ${prefix}ᴍᴇɴᴜ
│ ᪣ ${prefix}ᴍᴇɴᴜ2
│ ᪣ ${prefix}ᴄʀᴇᴀᴛᴏʀ
│ ᪣ ${prefix}ʟᴏɢɢᴇʀ
│ ᪣ ${prefix}ᴀᴅᴅᴏᴡɴᴇʀ
│
├─ム *ᴀɪ & sᴇᴀʀᴄʜ*
│ ᪣ ${prefix}ᴀɪ
│ ᪣ ${prefix}ᴀɪ-sᴇᴀʀᴄʜ
│ ᪣ ${prefix}ᴀɪᴠᴏɪᴄᴇ
│ ᪣ ${prefix}ɢᴇɴ
│ ᪣ ${prefix}ɢᴇɴ2
│ ᪣ ${prefix}ɪᴍɢ
│
├─ム *ᴅᴏᴡɴʟᴏᴀᴅᴇʀs*
│ ᪣ ${prefix}ᴛɪᴋᴛᴏᴋ / ${prefix}ᴛᴛ
│ ᪣ ${prefix}ʏᴛᴅʟ
│ ᪣ ${prefix}ʏᴛsᴇᴀʀᴄʜ
│ ᪣ ${prefix}ʏᴛᴍᴘ3
│ ᪣ ${prefix}ɪɴsᴛᴀᴅʟ
│ ᪣ ${prefix}ᴛᴡᴇᴇᴛ
│ ᪣ ${prefix}sʜᴀᴢᴀᴍ
│
├─ム *ᴛᴏᴏʟs*
│ ᪣ ${prefix}sᴛɪᴄᴋᴇʀ
│ ᪣ ${prefix}ᴏᴄʀ
│ ᪣ ${prefix}ᴛᴛs
│ ᪣ ${prefix}ᴘᴏʟʟ
│ ᪣ ${prefix}ᴛᴏᴀᴜᴅɪᴏ
│ ᪣ ${prefix}ᴛᴏᴜʀʟ
│ ᪣ ${prefix}ᴄᴏᴍᴘʀᴇss
│ ᪣ ${prefix}ᴛᴇxᴛᴘʀᴏ
│ ᪣ ${prefix}ᴠɪᴇᴡᴏɴᴄᴇ
│ ᪣ ${prefix}sᴀᴠᴇ
│ ᪣ ${prefix}sᴇʟғ
│ ᪣ ${prefix}ᴅᴇʟᴛᴍᴘ
│ ᪣ ${prefix}ᴇxᴇᴄ
│
├─ム *ᴘʀᴏғɪʟᴇ*
│ ᪣ ${prefix}sᴇᴛᴘᴘ
│ ᪣ ${prefix}ᴘʀᴏғɪʟᴇᴘɪᴄ
│ ᪣ ${prefix}ᴘᴘᴄᴏᴜᴘʟᴇ
│
├─ム *ɢʀᴏᴜᴘ*
│ ᪣ ${prefix}ᴛᴀɢᴀʟʟ
│ ᪣ ${prefix}ᴛᴀɢᴇᴠᴇʀʏᴏɴᴇ
│ ᪣ ${prefix}ᴛᴀɢᴍᴇ
│ ᪣ ${prefix}ʀᴇᴛᴀɢ
│ ᪣ ${prefix}ɢʀᴏᴜᴘ
│ ᪣ ${prefix}ɢʀᴏᴜᴘsᴛᴀᴛᴜs
│ ᪣ ${prefix}ɢʀᴏᴜᴘsᴇᴛᴛɪɴɢs
│ ᪣ ${prefix}ᴊᴏɪɴ
│ ᪣ ${prefix}ᴋɪᴄᴋ
│ ᪣ ${prefix}ᴡᴇʟᴄᴏᴍᴇ
│
├─ム *ᴄʜᴀɴɴᴇʟ*
│ ᪣ ${prefix}ᴄʜᴀɴɴᴇʟɪᴅ
│ ᪣ ${prefix}ᴄʜᴀɴɴᴇʟ-cᴍᴅ
│
├─ム *ᴀᴜᴛᴏ*
│ ᪣ ${prefix}ᴀʀɪsᴇ
│ ᪣ ${prefix}ᴀᴜᴛᴏʀᴇᴀᴄᴛ
│ ᪣ ${prefix}ɴɪɢɢᴀʀᴇᴘʟʏ
│ ᪣ ${prefix}ᴍᴇɴᴛɪᴏɴ
│
├─ム *ғᴜɴ*
│ ᪣ ${prefix}ʙʟᴜᴇᴀʀᴄʜɪᴠᴇ
│
├─ム *ᴀᴅᴍɪɴ*
│ ᪣ ${prefix}sᴇᴛᴘʀᴇғɪx
│
╰─────────◆────────╯

> 「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」
`.trim();

        try {    
            const imageBuffer = (await axios.get(global.menuImage || 'https://url.bmbxmd.workers.dev/Migo.jpeg', { 
                responseType: 'arraybuffer' 
            })).data;    
            
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
            // Fallback: send without image
            await m.reply(menuText);
        }    
    }
};