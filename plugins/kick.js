module.exports = {
    name: 'kick',
    aliases: ['remove'],
    description: 'Kick a member from the group',
    enabled: true,

    async execute(sock, m, args) {
        try {
            if (!m.isGroup) {
                return m.reply('ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴏɴʟʏ ᴡᴏʀᴋs ɪɴ ɢʀᴏᴜᴘs.');
            }

            const groupMetadata = await sock.groupMetadata(m.from);
            
            const senderId = m.sender;
            const senderBaseId = senderId.split(':')[0] + '@s.whatsapp.net';
            console.log('Sender ID (full):', senderId);
            console.log('Sender ID (base):', senderBaseId);
        
            const isAdmin = groupMetadata.participants.some(p => 
                (p.id === senderId || p.id === senderBaseId || p.phoneNumber === senderId || p.phoneNumber === senderBaseId) && p.admin === 'admin'
            );
            
            console.log('Is admin:', isAdmin);
            
            if (!isAdmin) {
                return m.reply('ᴏɴʟʏ ᴀᴅᴍɪɴs ᴄᴀɴ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ.');
            }
            
            let targetPhoneNumber;
            let targetLid;
            
            if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetLid = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
                
                const participant = groupMetadata.participants.find(p => p.id === targetLid);
                if (participant) {
                    targetPhoneNumber = participant.phoneNumber;
                }
            }
            else if (m.quoted) {
                const quotedSender = m.quoted.sender;
                targetPhoneNumber = quotedSender.includes(':') ? 
                    quotedSender.split(':')[0] + '@s.whatsapp.net' : 
                    quotedSender;
            }
            else if (args[0]) {
                const input = args[0].replace('@', '');
                
                if (input.length > 12 && !isNaN(input)) {
                    const participant = groupMetadata.participants.find(p => 
                        p.id.split('@')[0] === input
                    );
                    
                    if (participant) {
                        targetLid = participant.id;
                        targetPhoneNumber = participant.phoneNumber;
                    }
                } else {
                    let cleanNumber = input.replace(/[^0-9]/g, '');
                    
                    if (cleanNumber.length >= 7 && cleanNumber.length <= 15) {
                        targetPhoneNumber = cleanNumber + '@s.whatsapp.net';
                    }
                }
            } else {
                return m.reply('ʀᴇᴘʟʏ ᴛᴏ ᴀ ᴍᴇssᴀɢᴇ, ᴛᴀɢ ᴀ ᴜsᴇʀ, ᴏʀ ᴘʀᴏᴠɪᴅᴇ ᴀ ɴᴜᴍʙᴇʀ ᴏʀ ʟɪᴅ ᴛᴏ ᴋɪᴄᴋ.');
            }

            if (targetLid && !targetPhoneNumber) {
                const participant = groupMetadata.participants.find(p => p.id === targetLid);
                if (participant) {
                    targetPhoneNumber = participant.phoneNumber;
                }
            }

            if (!targetPhoneNumber) {
                return m.reply('ᴄᴏᴜʟᴅ ɴᴏᴛ ɪᴅᴇɴᴛɪꜰʏ ᴛʜᴇ ᴜsᴇʀ ᴛᴏ ᴋɪᴄᴋ. ᴛʀʏ ʀᴇᴘʟʏɪɴɢ ᴛᴏ ᴛʜᴇɪʀ ᴍᴇssᴀɢᴇ ɪɴsᴛᴇᴀᴅ.');
            }

            if (targetPhoneNumber.includes(':')) {
                targetPhoneNumber = targetPhoneNumber.split(':')[0] + '@s.whatsapp.net';
            }

            if (!targetPhoneNumber.includes('@s.whatsapp.net')) {
                targetPhoneNumber = targetPhoneNumber.replace('@', '') + '@s.whatsapp.net';
            }

            console.log('Final target:', targetPhoneNumber);

            const isUserInGroup = groupMetadata.participants.some(p => p.phoneNumber === targetPhoneNumber);
            
            if (!isUserInGroup) {
                return m.reply('ᴛʜɪs ᴜsᴇʀ ɪs ɴᴏᴛ ɪɴ ᴛʜᴇ ɢʀᴏᴜᴘ ᴏʀ ʜᴀs ᴀʟʀᴇᴀᴅʏ ʙᴇᴇɴ ʀᴇᴍᴏᴠᴇᴅ.');
            }

            const senderBaseForCompare = senderId.split(':')[0] + '@s.whatsapp.net';
            if (targetPhoneNumber === senderBaseForCompare) {
                return m.reply('ʏᴏᴜ ᴄᴀɴɴᴏᴛ ᴋɪᴄᴋ ʏᴏᴜʀsᴇʟꜰ.');
            }

            const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            if (targetPhoneNumber === botNumber) {
                return m.reply('ʏᴏᴜ ᴄᴀɴɴᴏᴛ ᴋɪᴄᴋ ᴛʜᴇ ʙᴏᴛ.');
            }

            const isTargetAdmin = groupMetadata.participants.some(p => 
                p.phoneNumber === targetPhoneNumber && p.admin === 'admin'
            );
            
            if (isTargetAdmin) {
                return m.reply('ᴄᴀɴɴᴏᴛ ᴋɪᴄᴋ ᴀɴᴏᴛʜᴇʀ ᴀᴅᴍɪɴ.');
            }

            await sock.groupParticipantsUpdate(m.from, [targetPhoneNumber], 'remove');
            
            await m.reply('ᴜsᴇʀ ʜᴀs ʙᴇᴇɴ ᴋɪᴄᴋᴇᴅ ꜰʀᴏᴍ ᴛʜᴇ ɢʀᴏᴜᴘ.');

        } catch (err) {
            console.error('Kick command error:', err);
            
            if (err.message?.includes('403') || err.data === 403) {
                await m.reply('ɪ ᴅᴏ ɴᴏᴛ ʜᴀᴠᴇ ᴘᴇʀᴍɪssɪᴏɴ ᴛᴏ ᴋɪᴄᴋ ᴜsᴇʀs. ᴍᴀᴋᴇ sᴜʀᴇ ɪ ᴀᴍ ᴀɴ ᴀᴅᴍɪɴ.');
            } else if (err.message?.includes('400') || err.data === 400) {
                await m.reply('ᴄᴀɴɴᴏᴛ ᴋɪᴄᴋ ᴛʜɪs ᴜsᴇʀ. ᴛʜᴇʏ ᴍɪɢʜᴛ ᴀʟʀᴇᴀᴅʏ ʙᴇ ʀᴇᴍᴏᴠᴇᴅ ᴏʀ ɴᴏᴛ ɪɴ ᴛʜᴇ ɢʀᴏᴜᴘ.');
            } else {
                if (err.message?.includes('text.match is not a function')) {
                    console.log('Kick succeeded but reply failed due to formatting');
                } else {
                    await m.reply('ꜰᴀɪʟᴇᴅ ᴛᴏ ᴋɪᴄᴋ ᴛʜᴇ ᴜsᴇʀ. ᴇʀʀᴏʀ: ' + (err.message || 'ᴜɴᴋɴᴏᴡɴ ᴇʀʀᴏʀ'));
                }
            }
        }
    }
};
