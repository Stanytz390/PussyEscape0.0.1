module.exports = {
    name: 'autoreact',
    description: 'Auto-reacts to messages from owners',

    async execute() {},

    async onMessage(sock, m) {
        try {
            if (!m.body) return;

            const owners = [
                '255620490076@lid',
                '255618558502@s.whatsapp.net'
            ];

            if (owners.includes(m.sender)) {
                await m.react('✨');
            }
        } catch (err) {
            console.error('❌ Auto-react error:', err);
        }
    }
};
