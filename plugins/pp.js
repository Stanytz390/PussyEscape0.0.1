module.exports = {
  name: 'profilepic',
  description: 'Get profile picture',
  aliases: ['pp', 'dp'],
  tags: ['tools'],
  command: /^\.?(profilepic|pp|dp)/i,

  async execute(sock, m) {
    try {
      const jid = m.quoted?.key?.participant || m.sender

      let ppUrl
      try {
        ppUrl = await sock.profilePictureUrl(jid, 'image')
      } catch {
        ppUrl = await sock.profilePictureUrl(jid, 'preview')
      }

      const quotedMsg = m.quoted || {
        key: {
          remoteJid: m.from,
          fromMe: false,
          id: m.id,
          participant: m.sender
        },
        message: {
          extendedTextMessage: {
            text: m.body
          }
        }
      }

      await sock.sendMessage(
        m.from,
        {
          image: { url: ppUrl },
          caption: 'Profile picture',
          contextInfo: {
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363404317544295@newsletter',
              newsletterName: 'ᴘᴜssʏ ᴇsᴄᴀᴘᴇ 😐「 𝙏𝙞𝙢𝙚 - 𝙏𝙞𝙢𝙚𝙡𝙚𝙨𝙨 」'
            },
            isForwarded: true,
            externalAdReply: {
              title: 'ꜱᴛᴀɴʏᴛᴢ',
              body: '𝘗𝘰𝘸𝘦𝘳𝘦𝘥 𝘣𝘺 ꜱᴛᴀɴʏᴛᴢ',
              thumbnailUrl: ppUrl,
              mediaType: 1,
              mediaUrl: 'https://meetus.stanymaxhub.online',
              sourceUrl: 'https://meetus.stanymaxhub.online',
              showAdAttribution: true
            }
          }
        },
        { quoted: quotedMsg }
      )

    } catch (err) {
      console.error('Profile pic error:', err)
      m.reply('Failed to fetch profile picture.')
    }
  }
}
