const os = require("os");
const packageJson = require("./package.json"); // Get package details

function formatUptime(seconds) {
  let d = Math.floor(seconds / (3600 * 24));
  let h = Math.floor((seconds % (3600 * 24)) / 3600);
  let m = Math.floor((seconds % 3600) / 60);
  let s = Math.floor(seconds % 60);
  let dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : "";
  let hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
  let mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
  let sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
  return (dDisplay + hDisplay + mDisplay + sDisplay).trim().replace(/,\s*$/, "") || "0 seconds";
}

module.exports = {
  IMG: "https://i.ibb.co/MDwfZhF0/Untitled-1.jpg",
  ARTISTS:[
      "Ranwan Liyanage original",
      "Amal Perera original",
      "Clarence Wijewardena original",
      "Sunil Edirisinghe original",
      "Victor Ratnayake original",
      "Nanda Malini original",
      "Sanuka Wickramasinghe original",
      "Kasun Kalhara original",
      "Uresha Ravihari original",
      "Dinesh Kanagaratnam original"
    ],
  //====================menu=================================
  MENUMSG: function (pushname, runtimeOrConfig, configOrUndefined) {
    let config = typeof runtimeOrConfig === "object" ? runtimeOrConfig : configOrUndefined;
    let runtime = typeof runtimeOrConfig === "function" ? runtimeOrConfig : formatUptime;
    if (!config) config = {};
    return `
✘◍ ꜱᴇʟᴇᴛᴇ ʏᴏᴜʀ ᴀheader. 
ᴛʜᴀɴᴋꜱ ꜰᴏʀ ᴜꜱɪɴɢ ʙᴏᴛ.

┏━━━━❮ 📆 ᴛᴏ ᴅᴀʏ 📆❯━━━━
┃
┃ 📅 Date Today : ${new Date().toLocaleDateString("en-GB", {
      timeZone: "Asia/Colombo",
    })}
┃ ⌚ Time Now : ${new Date().toLocaleTimeString("en-GB", {
      timeZone: "Asia/Colombo",
    })}
┃
┗━━━━━━━━━━━━━━━
┏━━━━❮📝 ᴅᴇᴛᴇʟᴇ𝒔 📝❯━━━
┃🗣️ 𝚄𝚜𝚎𝚛 : ${pushname}
┃🤖 𝙱𝚘𝚝 : © DanieWatch Downloader Bot V${packageJson.version}
┃📜 𝙿𝚛𝚎𝚏𝚒𝚡 : ${config.PREFIX || ""}
┃📚 𝚅𝚎𝚛𝚜𝚒𝚘𝚗 : ${packageJson.version}
┃📝 𝙿𝚕𝚊𝚝𝚏𝚘𝚛𝚖 : ${os.platform()}
┃📟 𝙷𝚘𝚜𝚝 : ${os.hostname()}
┃🤴𝙾𝚠念 : ${config.OWNER_NAME || ""}
┃🔊 𝙼𝚘𝚍𝚎 : ${config.MODE || ""}
┃🍁 𝚄𝚙𝚝𝚒𝚖𝚎 : ${runtime(process.uptime())}
┃✨𝙼𝚎𝚖 : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
      2
    )}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB
┗━━━━━━━━━━━━━━━
        `.trim();
  },
  //======================download============================
  TIKTOK: function (title, author, q) {
    return `
🎟️ *DANIEWATCH TIKTOK DOWNLOADER* 🎟️

🔢 *Please reply with the number you want to select:*

Title  * ${title}
Author * ${author}
URL    * ${q}
        `.trim();
  },
  FACEBOOK: function (title, q) {
    return `
💢 DANIEWATCH FB DOWNLOADER 💢
    
🎞 TITLE 🎞 ${title}

Fb-Url: -=-${q} 
        `.trim();
  },
  TWITTER: function (desc, q) {
    return `
💢 DANIEWATCH TWITTER DOWNLOADER 💢

📝 Description: ${desc || "No description"}

Twitter URL: ${q}
        `.trim();
  },
  //=================main==================================
  ALIVEIMG: "./src/media/LOGOS/alive.jpg",
  ALIVEVOICE: "./src/media/Auto_voice/alive.aac",
  ALIVEMSG: function (arg1, arg2, arg3, arg4) {
    let hostname, config, pushname, runtime;
    if (typeof arg1 === "object") {
      config = arg1;
      pushname = arg2;
      runtime = typeof arg3 === "function" ? arg3 : formatUptime;
      hostname = os.platform();
    } else {
      hostname = arg1;
      config = arg2;
      pushname = arg3;
      runtime = typeof arg4 === "function" ? arg4 : formatUptime;
    }
    if (!config) config = {};
    return `
🧚‍♂️⃟🩵 𝐃𝐀𝐍𝐈𝐄𝐖𝐀𝐓𝐂𝐇 𝐃class 𝐀𝐋𝐈𝐕𝐄 𝐒𝐓𝐀𝐓𝐔𝐒 🧚‍♂️⃟🩵

✘◍ 𝗜'𝗺 𝗔𝗹𝗶𝘃𝗲, 𝗧𝗵𝗮𝗻𝗸𝘀 𝗳𝗼𝗿 𝗔𝘀𝗸𝗶𝗻𝗴!

┏━━━━❮ 📅 𝑻𝑶𝑫𝑎𝒚 📅❯━━━━
┃
┃ 📅 Date Today: ${new Date().toLocaleDateString("en-GB", {
      timeZone: "Asia/Colombo",
    })}
┃ ⌚ Time Now: ${new Date().toLocaleTimeString("en-GB", {
      timeZone: "Asia/Colombo",
    })}
┃
┗━━━━━━━━━━━━━━━
┏━━━━❮📝 𝗦𝘁𝗮𝘁𝘂𝘀 𝗗class 📝❯━━━
┃🗣️ 𝚄𝚜𝚎𝚛 : ${pushname}
┃🤖 𝙱𝚘𝚝 : © DanieWatch Downloader Bot V${packageJson.version}
┃📜 𝙿𝚛𝚎𝚏𝚒𝚡 : ${config.PREFIX || ""}
┃📚 𝚅𝚎𝚛𝚜𝚒𝚘𝚗 : ${packageJson.version}
┃📝 𝙿𝚕𝚊𝚝𝚏𝚘𝚛𝚖 : ${hostname}
┃📟 𝙷𝚘𝚜𝚝 : ${os.hostname()}
┃⚙️ 𝙼𝚘𝚍𝚎 : ${config.MODE || ""}
┃💻 𝚄𝚙𝚝𝚒𝚖𝚎 : ${runtime(process.uptime())}
┃✨𝙼𝚎𝚖 : ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
      2
    )}MB / ${Math.round(require("os").totalmem() / 1024 / 1024)}MB
┗━━━━━━━━━━━━━━━

💬 ᴇɴᴏʏ ᴛʜᴇ 𝗯𝗼𝘁 ᴏ𝗳 𝚚𝚞𝚎𝚎𝚗 𝗮𝗻𝗷𝘂! ✨
        `.trim();
  },
  //====================movie======================================
  GROUP: function (groupName, conf) {
    return `
📨 *𝙎𝙝𝙖𝙧𝙚𝙙 𝙄𝙣:* ${groupName}
🛡️ *𝘼𝙙𝙢𝙞𝙣:* ${conf.MNAME}
        `.trim();
  },
  SINHALASUB: function (movieData) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

✨ *𝙼𝚘𝚟𝚒𝚎 𝙽𝚊𝚖𝚎:* ${movieData.title}
⭐ *𝙸𝙼𝙳𝙱 𝚁𝚊𝚝𝚒𝚗𝚐:* ${movieData.rating?.value || "𝙽/𝙰"} ★
📆 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎 𝙳𝚊𝚝𝚎:* ${movieData.metadata?.releaseDate || "𝙽/𝙰"}
🌐 *𝙲𝚘𝚞𝚗𝚝𝚛𝚢:* ${movieData.metadata?.country || "𝙽/𝙰"}
⏱️ *𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗:* ${movieData.metadata?.runtime || "𝙽/𝙰"}
        `.trim();
  },
  CINESUBZ: function (title, metadata, rating) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

✨ *𝙼𝚘𝚟𝚒𝚎 𝙽𝚊𝚖𝚎:* 𝘾𝙝𝙚𝙘𝙠 𝙞𝙩 𝙤𝙪𝙩 → ${title}
       
⭐ *𝙸𝙼𝙳𝙱 𝚁𝚊𝚝𝚒𝚗𝚐:* ${rating?.value || "𝙽/𝙰"} ★
📆 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎 𝙳𝚊𝚝𝚎:* ${metadata?.releaseDate || "𝙽/𝙰"}
🌐 *𝙲𝚘𝚞𝚗𝚝𝚛𝚢:* ${metadata?.country || "𝙽/𝙰"}
⏱️ *𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗:* ${metadata?.runtime || "𝙽/𝙰"}
🎭 *𝙶𝚎𝚗𝚛𝚎𝚜:* ${metadata?.genres.map((g) => `#${g}`).join(" • ") || "𝙽/𝙰"} 
        `.trim();
  },
  CINETVSHOW: function (movieResponse) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

📺 *𝚃𝚅 𝚂𝚑𝚘𝚠:* ${movieResponse.episodeInfo?.title || "𝙽/𝙰"}
🎞️ *𝙴𝚙𝚒𝚜𝚘𝚍𝚎 𝚃𝚒𝚝𝚕𝚎:* ${movieResponse.episodeInfo?.episodeTitle || "𝙽/𝙰"}
📅 *𝙳𝚊𝚝𝚎:* ${movieResponse.episodeInfo?.date || "𝙽/𝙰"}
        `.trim();
  },
  SINHALASUBTVSHOW: function (episodeInfo, quality) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

📺 *TV Show:* ${episodeInfo.title || "N/A"}
🎞️ *Episode:* ${episodeInfo.episodeTitle || "N/A"}
📅 *Date:* ${episodeInfo.date || "N/A"}
💾 *Quality:* ${quality.toUpperCase()}
        `.trim();
  },
  CINETVSHOWALLDL: function (movieData) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

✨ *𝙼𝚘𝚟𝚒𝚎 𝚃𝚒𝚝𝚕𝚎:* ${movieData.data.title}
📆 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎 𝙳𝚊𝚝𝚎:* ${movieData.data.releaseDate}
🌐 *𝙽𝚎𝚝𝚠𝚘𝚛𝚔:* ${movieData.data.network}
        `.trim();
  },
  SINHALASUBTVSHOWALLDL: function (movieData) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

✨ *𝙼𝚘𝚟𝚒𝚎 𝚃𝚒𝚝𝚕𝚎:* ${movieData.data.showInfo.title}
📆 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎 𝙳𝚊𝚝𝚎:* ${movieData.data.showInfo.releaseDate}
🌐 *𝙽𝚎𝚝𝚠𝚘𝚛𝚔:* ${movieData.data.showInfo.network}
        `.trim();
  },
  SIMNHALAMOVIE: function (title) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

🎞️ *𝚃𝚒𝚝𝚕𝚎:* ${title}  
        `.trim();
  },
  AWAMOVIE: function (title, releaseDate, country) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

🎞️ *𝚃𝚒𝚝𝚕𝚎:* ${title}  
📆 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎 𝙳𝚊𝚝𝚎:* ${releaseDate}  
🌐 *𝙲𝚘𝚞𝚗𝚝𝚛𝚢:*  ${country}      
        `.trim();
  },
  ANIMEMOVIE: function (title, releaseDate, country, duration) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

✨ ${title} 
📅 𝗥𝗲𝗹𝗲𝗮𝘀𝗲 𝗗𝗮𝘁𝗲:${releaseDate}  
🌍 𝗖𝗼𝘂𝗻𝘁𝗿𝘆:${country}  
⏳ 𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:${duration}  
        `.trim();
  },
  BAISCOMOVIE: function (title, year, rating, duration) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

🎞️ *𝚃𝚒𝚝𝚕𝚎:*  ${title} 
📅 𝗥𝗲𝗹𝗲𝗮𝘀𝗲 𝗗𝗮𝘁𝗲:${year}  
🌍 RATINGS:${rating}  
⏳ 𝗗𝘂𝗿𝗮𝘁𝗶𝗼𝗻:${duration}  
        `.trim();
  },
  ADULTMOVIE: function (title, rating, description) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿
──────────────────
✨ *Title:* ${title}
⭐ *Rating:* ${rating}

🌍 *Description:*  
${description}
──────────────────
📥 *Downloading...*
        `.trim();
  },
  ANIMOMOVIE: function (movieData) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿  
        
✨ ${movieData.title}  
⭐ Description:${movieData.description} 
    
🌍  ${movieData.plot} 
        `.trim();
  },
  FILMPOMOVIE: function (title, rating, year, duration) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿  

✨ *𝙼𝚘𝚟𝚒𝚎 𝙽𝚊𝚖𝚎:* ${title}
⭐ *𝙸𝙼𝙳𝙱 𝚁𝚊𝚝𝚒𝚗𝚐:* ${rating}
📅 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎 𝙳𝚊𝚝𝚎:* ${year}
⏳ *𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗:* ${duration}
        `.trim();
  },
  //=====================youtube===========================================
  SONG: function (data) {
    return `
🎵 SONG DOWNLOADER
      
✅ Song Found!
          
• 🎶 *Title:* ${data.title}
• ⏱️ *Duration:* ${data.timestamp}
• 👁️ *Views:* ${data.views}
• 📅 *Uploaded On:* ${data.ago}
• 🔗 *Link:* ${data.url}
          
🎧 Enjoy your music with DanieWatch Downloader Bot  
❤️ Created by Daniyal Aadil
        `.trim();
  },
  YTMP3: function (data) {
    return `
🎥 *MP3 Download Found!* 

➥ *Title:* ${data.title} 
➥ *Duration:* ${data.timestamp} 
➥ *Views:* ${data.views} 
➥ *Uploaded On:* ${data.ago} 
➥ *Link:* ${data.url}

🎬 *Enjoy the video brought to you by DanieWatch Downloader Bot!* 
        `.trim();
  },
  VIDEO: function (data) {
    return `
🎵 VIDEO DOWNLOADER
      
✅ VIDEO Found!
          
• 🎶 *Title:* ${data.title}
• ⏱️ *Duration:* ${data.timestamp}
• 👁️ *Views:* ${data.views}
• 📅 *Uploaded On:* ${data.ago}
• 🔗 *Link:* ${data.url}
          
🎧 Enjoy your music with DanieWatch Downloader Bot  
❤️ Created by Daniyal Aadil
        `.trim();
  },
  YTMP4: function (data) {
    return `
🎥 *MP4 Download Found!* 

➥ *Title:* ${data.title} 
➥ *Duration:* ${data.timestamp} 
➥ *Views:* ${data.views} 
➥ *Uploaded On:* ${data.ago} 
➥ *Link:* ${data.url} 

🎬 *Enjoy the video brought to you by DanieWatch Downloader Bot!* 
        `.trim();
  },
  //=====================hiru news===========================================
  AUTONEWS: function (source, newsData, isGroup, groupMetadata, conf) {
    return `
📰 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑵𝑬𝑾𝑺 』* 🗞️

✨ *${source.toUpperCase()} News Update*

📌 *Title:* ${newsData.title}
📅 *Date:* ${newsData.date || "N/A"}

📝 *Description:*
${newsData.desc || "No details available"}
${isGroup ? `\n\n📨 *Shared In:* ${groupMetadata?.subject || "Group"}\n🛡️ *Admin:* ${conf.MNAME}\n` : ""}
🔗 *Read more:* ${newsData.url}
━━━━━━━━━━━━━━━━━━━━━━━━━━━`.trim();
  },
  AUTOMOVIE: function (title, rating, metadata, description, isGroup, groupMetadata, conf) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿

✨ *𝙼𝚘𝚟𝚒𝚎 𝙽𝚊𝚖𝚎:* ${title}
⭐ *𝙸𝙼𝙳𝙱 𝚁𝚊𝚝𝚒𝚗𝚐:* ${rating?.value || "𝙽/𝙰"} ★
📆 *𝚁𝚎𝚕𝚎𝚊𝚜𝚎 𝙳𝚊𝚝𝚎:* ${metadata?.releaseDate || "𝙽/𝙰"}
🌐 *𝙲𝚘𝚞𝚗𝚝𝚛𝚢:* ${metadata?.country || "𝙽/𝙰"}
⏱️ *𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗:* ${metadata?.runtime || "𝙽/𝙰"}
🎭 *𝙶𝚎𝚗𝚛𝚎𝚜:* ${metadata?.genres?.map(g => `#${g}`).join(" • ") || "𝙽/𝙰"}

${isGroup ? `📨 *𝙎𝙝𝙖𝙧𝙚𝙙 𝙄𝙣:* ${groupMetadata?.subject || "Group"}\n🛡️ *𝘼𝙙𝙢𝙞𝙣:* ${conf.MNAME}` : ""}

📝 *𝙈𝚘𝚟𝚒𝚎 𝙎𝚞𝚖𝚖𝚊𝚛𝚢:*
${description || "— 𝙉𝙤 𝙙𝙚𝙩𝙖𝙞𝙡𝙨 𝙖𝙫𝙖𝙞𝙡𝙖𝙗𝙡𝙚 —"}

━━━━━━━━━━━━━━━
${conf.FOOTER}`.trim();
  },
  AUTOSONG: function (foundSong, currentArtist, nextArtist, config, botNumber, isGroup, groupMetadata) {
    return `
✨ *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑴𝑼𝑺𝑰𝑪 』* 🎧

━━━━━━━━━━━━━━━━━━━
🎶 *𝚂𝙾𝙽𝙶 𝙳𝙴𝚃𝙰𝙸𝙻𝚂* 🎼
╠➤ *𝚃𝚒𝚝𝚕𝚎:* ${foundSong.title}
╠➤ *𝙰𝚛𝚝𝚒𝚜𝚝:* ${currentArtist.replace(" original", "")}
╠➤ *𝙳𝚞𝚛𝚊𝚝𝚒𝚘𝚗:* ${foundSong.timestamp || "𝙽/𝙰"}
╠➤ *𝚅𝚒𝚎𝚠𝚜:* ${foundSong.views.toLocaleString() || "𝙽/𝙰"}
╠➤ *𝚄𝚙𝚕𝚘𝚊𝚍𝚎𝚍:* ${foundSong.ago || "𝙽/𝙰"}
╠➤ *𝙽𝚎𝚡𝚝 𝙰𝚛𝚝𝚒𝚜𝚝:* ${nextArtist}
━━━━━━━━━━━━━━━━━━━
📌 *𝚈𝚘𝚞𝚃𝚞𝚋𝚎 𝙻𝙸𝙽𝙺:* 
    ${foundSong.url}
    ${isGroup ? `

━━━━━━━━━━━━━━━━━━━
👥 *𝙶𝚁𝙾𝚄𝙿 𝙸𝙽𝙵𝙾* 
╠➤ *𝙽𝚊𝚖𝚎:* ${groupMetadata?.subject || "Group"}
╠➤ *𝙰𝚍𝚖𝚒𝚗:* ${config.MNAME}
╠➤ *𝙱𝚘𝚝 𝙽𝚞𝚖𝚋𝚎𝚛:* ${botNumber}
━━━━━━━━━━━━━━━━━━━
` : ""}
${config.FOOTER || "🎼 Enjoy the music! 🎧"}`.trim();
  },
  AIMODEPROMPT: function (userMessage) {
    return `
    You're an advanced AI assistant called "DanieWatch AI." You're professional, respectful, and knowledgeable, always ready to assist with expertise. 👑 Your goal is to provide helpful, accurate, and engaging responses while maintaining a courteous and professional tone.
    
    usermessage in {${userMessage}}`;
  },
  MVDL_SEARCH_PROMPT: "🔍 *Please provide a search query!*\nExample: `.movie deadpool`",
  MVDL_SEARCH_RESULTS: function (query) {
    return `🎬 *Search Results for:* "${query.toUpperCase()}"\n───────────────────`;
  },
  MVDL_SEARCH_FAILED: "❌ *Failed to fetch search results! Please try again later.*",
  MVDL_INVALID_REQUEST: "❌ *Invalid download request!*",
  MVDL_MOVIE_INFO: function (movie, isMovie, genres, duration, rating, dubs, cast) {
    return `
🎬 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿
───────────────────
📝 *Title:* ${movie.title}
🎭 *Type:* ${isMovie ? "Movie" : "TV Series"}
🎭 *Genres:* ${genres}
⏱️ *Duration:* ${duration}
⭐ *IMDB Rating:* ${rating}
🌐 *Languages:* ${dubs}
👥 *Cast:* ${cast}

📝 *Summary:*
${movie.description || "— No summary available —"}
───────────────────
`.trim();
  },
  MVDL_CHOOSE_QUALITY: "\n\n📥 *Select a quality option below to start download:*",
  MVDL_NO_SEASONS: "❌ *No seasons found for this TV Series!*",
  MVDL_CHOOSE_SEASON: "\n\n📺 *Choose a Season below to view episodes:*",
  MVDL_INFO_FAILED: "❌ *Failed to fetch movie/show details!*",
  MVDL_SEASON_CAPTION: function (movie, seasonNumber, maxEpisode) {
    return `
📺 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿
───────────────────
🎬 *Title:* ${movie.title}
📅 *Season:* ${seasonNumber}
🎞️ *Total Episodes:* ${maxEpisode}
───────────────────
`.trim();
  },
  MVDL_SEASON_FAILED: "❌ *Failed to load season details!*",
  MVDL_EPISODE_CAPTION: function (movie, seasonNumber, episodeNumber) {
    return `
📺 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑪𝑰𝑵𝑬𝑴𝑨 』* 🍿
───────────────────
🎬 *Title:* ${movie.title}
📅 *Season:* ${seasonNumber}
🎞️ *Episode:* ${episodeNumber}
───────────────────
`.trim();
  },
  MVDL_EPISODE_FAILED: "❌ *Failed to load episode download options!*",
  MVDL_MOVIE_CARD: function (movie, quality, size, season, episode, format) {
    return `
📥 *『 𝑫𝑨𝑵𝑰𝑬𝑾𝑨𝑻𝑪𝑯 𝑫𝑶𝑾𝑵𝑳𝑶𝑨𝑫𝑬𝑹 』* 🚀
───────────────────
🎬 *File Name:* ${movie.title}
💿 *Quality:* ${quality}
💾 *Size:* ${size}
${season ? `📅 *Season:* ${season}\n🎞️ *Episode:* ${episode}\n` : ""}
───────────────────
⚡ *Sending as document, please wait...*
`.trim();
  },
  MVDL_DOWNLOAD_SUCCESS: "✅ *File downloaded and sent successfully!*",
  MVDL_DOWNLOAD_FAILED: "❌ *Error fetching this download link!*",
  MVDL_SUB_INVALID: "❌ *Invalid subtitle download request!*",
  MVDL_SUB_NO_AVAILABLE: "❌ *No subtitles available for this movie/episode!*",
  MVDL_SUB_LANGUAGES: "📝 *Select a language below to download subtitles:*",
  MVDL_SUB_CAPTION: function (langName) {
    return `📝 *Subtitle Language:* ${langName}\n⚡ *Brought to you by DanieWatch Bot!*`;
  },
  MVDL_SUB_FAILED: "❌ *Failed to download subtitles!*"
};
