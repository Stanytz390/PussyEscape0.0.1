module.exports = {
    name: 'alive',
    description: 'Check if the bot is alive',
    aliases: [],
    tags: ['main'],
    command: /^(alive)$/i,

    async execute(sock, m) {
        try {
            const name = m.pushName || m.sender.split('@')[0];
            const audioUrl = 'https://files.catbox.moe/tcz5xk.mp3';
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
                    fileName: 'Alive',
                    contextInfo: {
                        mentionedJid: [m.sender],
                        externalAdReply: {
                            title: 'I AM ALIVE',
                            body: 'BOT STATUS',
                            thumbnailUrl: thumbnail,
                            sourceUrl: 'https://www.whatsapp.com/channel/0029Vb7fzu4EwEjmsD4Tzs1p',
                            mediaType: 1,
                            renderLargerThumbnail: true,
                        },
                    },
                },
                { quoted }
            );
        } catch (err) {
            console.error('❌ Alive plugin error:', err);
        }
    },
};
