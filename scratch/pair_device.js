const { default: makeWASocket, useMultiFileAuthState, delay } = require('anju-xpro-baileys');

async function pairDevice() {
  const number = '923013068663';
  console.log(`\n==================================================`);
  console.log(`📱 Generating WhatsApp Pairing Code for ${number}...`);
  console.log(`==================================================\n`);

  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const conn = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' })
  });

  conn.ev.on('creds.update', saveCreds);

  let codeRequested = false;
  conn.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting' && !conn.authState.creds.registered && !codeRequested) {
      codeRequested = true;
      await delay(2000);
      try {
        const code = await conn.requestPairingCode(number);
        console.log(`\n==================================================`);
        console.log(`🔑 YOUR PAIRING CODE:  \x1b[32m${code}\x1b[0m`);
        console.log(`==================================================`);
        console.log(`\n👉 Open WhatsApp on your phone (${number}):`);
        console.log(`   1. Settings -> Linked Devices`);
        console.log(`   2. Link a Device -> Link with phone number instead`);
        console.log(`   3. Enter code: ${code}\n`);
      } catch (err) {
        console.error('❌ Failed to request pairing code:', err.message);
        codeRequested = false;
      }
    }

    if (connection === 'open') {
      console.log(`\n==================================================`);
      console.log(`🎉 SUCCESS! WhatsApp Device Connected & Registered!`);
      console.log(`==================================================\n`);
      process.exit(0);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connection closed (status ${statusCode}). Reconnecting in 3s...`);
      setTimeout(() => pairDevice(), 3000);
    }
  });
}

pairDevice();
