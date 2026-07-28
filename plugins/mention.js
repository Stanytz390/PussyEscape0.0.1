module.exports = {
    name: 'mention-owner',
    description: 'Auto reply + react when owner is tagged in a group',

    async execute() {},

    async onMessage(sock, m) {
        try {
            const text = m.body || m.text || m.message?.extendedTextMessage?.text || '';
           // console.log('New message:', text); YA FOR DEBUGS

            const owners = ['255620490076', '255787069580'];
            const isOwnerTagged = owners.some(owner => text.includes(`@${owner}`));
            if (!isOwnerTagged) return;

            //console.log('Owner was tagged!'); YA FOR DEBUGS

            const name = m.pushName || m.sender.split('@')[0];
            const audioUrl = 'https://eliteprotech-url.zone.id/1776469526953sb2cs9.mp3';
            const thumbnail = 'https://url.bmbxmd.workers.dev/Migo.jpeg';
            const quoted = {
                key: {
                    fromMe: false,
                    participant: m.sender,
                    ...(m.isGroup ? { remoteJid: m.from } : {}),
                },
                message: {
                    contactMessage: {
                        displayName: name,
                        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;a,;;;\nFN:${name}\nitem1.TEL;waid=${m.sender.split('@')[0]}:${m.sender.split('@')[0]}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`,
                    },
                },
            };

            await m.send(
                {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    waveform: [100, 0, 100, 0, 100, 0, 100],
                    fileName: 'OwnerTag',
                    contextInfo: {
                        mentionedJid: [m.sender],
                        externalAdReply: {
                            title: "You tagged my owner ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐",
                            body: 'ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐 ᴍᴜʟᴛɪᴅᴇᴠɪᴄᴇ',
                            thumbnailUrl: thumbnail,
                            sourceUrl: 'https://www.whatsapp.com/channel/0029Vb7fzu4EwEjmsD4Tzs1p',
                            mediaType: 1,
                            renderLargerThumbnail: true,
                        },
                    },
                },
                { quoted }
            );

            await m.react("✨");

        } catch (err) {
            console.error('❌ Mention-owner plugin error:', err);
        }
    }
};
