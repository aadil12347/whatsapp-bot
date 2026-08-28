const os = require("os");
const packageJson = require("./package.json");

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
  IMG: "./assets/daniewatch_logo.png",
  ARTISTS: [
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
  SIGNATURE: function (config) {
    return `╭─── ✨ *DANIEWATCH BOT* ✨ ───╮`;
  },
  //====================menu=================================
  MENUMSG: function (pushname, runtimeOrConfig, configOrUndefined) {
    let config = typeof runtimeOrConfig === "object" ? runtimeOrConfig : configOrUndefined;
    let runtime = typeof runtimeOrConfig === "function" ? runtimeOrConfig : formatUptime;
    if (!config) config = {};
    const dateStr = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" });
    const timeStr = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Colombo" });
    const ramUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const ramTotal = Math.round(os.totalmem() / 1024 / 1024);

    return `
╭─── ✨ *DANIEWATCH MENU* ✨ ───╮

┌─❒ *System Overview*
│ 👤 *User:* ${pushname}
│ 🤖 *Bot:* © DanieWatch V${packageJson.version}
│ 📜 *Prefix:* ${config.PREFIX || "."}
│ ⚙️ *Mode:* ${config.MODE || "Active"}
│ 👑 *Owner:* ${config.OWNER_NAME || "Daniyal Aadil"}
│ ⏱️ *Uptime:* ${runtime(process.uptime())}
│ 🧠 *RAM:* ${ramUsed} MB / ${ramTotal} MB
│ 💻 *Platform:* ${os.platform()}
│ 📟 *Host:* ${os.hostname()}
└───────────────

┌─❒ *Date & Time*
│ 📅 *Date:* ${dateStr}
│ ⌚ *Time:* ${timeStr}
└───────────────

🚀 _Send any direct media link or command to start downloading!_
`.trim();
  },
  //======================download============================
  TIKTOK: function (title, author, q) {
    return `
╭─── 🎵 *TIKTOK DOWNLOADER* 🎵 ───╮

┌─❒ *Video Info*
│ 📌 *Title:* ${title || "TikTok Video"}
│ 👤 *Author:* ${author || "N/A"}
│ 🔗 *URL:* ${q}
└───────────────

⚡ *Brought to you by DanieWatch Bot!*
`.trim();
  },
  FACEBOOK: function (title, q) {
    return `
╭─── 📘 *FACEBOOK DOWNLOADER* 📘 ───╮

┌─❒ *Video Info*
│ 📌 *Title:* ${title || "Facebook Video"}
│ 🔗 *URL:* ${q}
└───────────────

⚡ *Brought to you by DanieWatch Bot!*
`.trim();
  },
  TWITTER: function (desc, q) {
    return `
╭─── 🐦 *TWITTER DOWNLOADER* 🐦 ───╮

┌─❒ *Tweet Info*
│ 📝 *Description:* ${desc || "No description"}
│ 🔗 *URL:* ${q}
└───────────────

⚡ *Brought to you by DanieWatch Bot!*
`.trim();
  },
  //=================main==================================
  ALIVEIMG: "./assets/daniewatch_logo.png",
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
    const ramUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const ramTotal = Math.round(os.totalmem() / 1024 / 1024);

    return `
╭─── ⚡ *DANIEWATCH ALIVE* ⚡ ───╮

┌─❒ *Bot Status*
│ ⚡ *Status:* Online & Active!
│ 👤 *User:* ${pushname}
│ 🤖 *Bot:* © DanieWatch V${packageJson.version}
│ 📜 *Prefix:* ${config.PREFIX || "."}
│ ⏱️ *Uptime:* ${runtime(process.uptime())}
│ 🧠 *Memory:* ${ramUsed} MB / ${ramTotal} MB
│ 💻 *Platform:* ${hostname}
│ ⚙️ *Mode:* ${config.MODE || "Active"}
└───────────────

🚀 _Ready for movie & video downloads!_
`.trim();
  },
  //====================movie======================================
  GROUP: function (groupName, conf) {
    return `
📨 *Shared In:* ${groupName}
🛡️ *Admin:* ${conf.MNAME}
`.trim();
  },
  SINHALASUB: function (movieData) {
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Movie Info*
│ ✨ *Name:* ${movieData.title}
│ ⭐ *IMDB Rating:* ${movieData.rating?.value || "N/A"} ★
│ 📆 *Release Date:* ${movieData.metadata?.releaseDate || "N/A"}
│ 🌐 *Country:* ${movieData.metadata?.country || "N/A"}
│ ⏱️ *Duration:* ${movieData.metadata?.runtime || "N/A"}
└───────────────
`.trim();
  },
  CINESUBZ: function (title, metadata, rating) {
    const genres = metadata?.genres?.map((g) => `#${g}`).join(" • ") || "N/A";
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Movie Details*
│ ✨ *Title:* ${title}
│ ⭐ *IMDB Rating:* ${rating?.value || "N/A"} ★
│ 📆 *Release Date:* ${metadata?.releaseDate || "N/A"}
│ 🌐 *Country:* ${metadata?.country || "N/A"}
│ ⏱️ *Duration:* ${metadata?.runtime || "N/A"}
│ 🎭 *Genres:* ${genres}
└───────────────
`.trim();
  },
  CINETVSHOW: function (movieResponse) {
    return `
╭─── 📺 *DANIEWATCH TV SHOW* 🍿 ───╮

┌─❒ *Episode Info*
│ 📺 *Show:* ${movieResponse.episodeInfo?.title || "N/A"}
│ 🎞️ *Episode:* ${movieResponse.episodeInfo?.episodeTitle || "N/A"}
│ 📅 *Date:* ${movieResponse.episodeInfo?.date || "N/A"}
└───────────────
`.trim();
  },
  SINHALASUBTVSHOW: function (episodeInfo, quality) {
    return `
╭─── 📺 *DANIEWATCH TV SHOW* 🍿 ───╮

┌─❒ *Episode Details*
│ 📺 *TV Show:* ${episodeInfo.title || "N/A"}
│ 🎞️ *Episode:* ${episodeInfo.episodeTitle || "N/A"}
│ 📅 *Date:* ${episodeInfo.date || "N/A"}
│ 💾 *Quality:* ${quality.toUpperCase()}
└───────────────
`.trim();
  },
  CINETVSHOWALLDL: function (movieData) {
    return `
╭─── 📺 *DANIEWATCH TV SHOW* 🍿 ───╮

┌─❒ *Show Info*
│ ✨ *Title:* ${movieData.data.title}
│ 📆 *Release Date:* ${movieData.data.releaseDate}
│ 🌐 *Network:* ${movieData.data.network}
└───────────────
`.trim();
  },
  SINHALASUBTVSHOWALLDL: function (movieData) {
    return `
╭─── 📺 *DANIEWATCH TV SHOW* 🍿 ───╮

┌─❒ *Show Info*
│ ✨ *Title:* ${movieData.data.showInfo.title}
│ 📆 *Release Date:* ${movieData.data.showInfo.releaseDate}
│ 🌐 *Network:* ${movieData.data.showInfo.network}
└───────────────
`.trim();
  },
  SIMNHALAMOVIE: function (title) {
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Title*
│ 🎞️ ${title}
└───────────────
`.trim();
  },
  AWAMOVIE: function (title, releaseDate, country) {
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Movie Info*
│ 🎞️ *Title:* ${title}
│ 📆 *Release Date:* ${releaseDate}
│ 🌐 *Country:* ${country}
└───────────────
`.trim();
  },
  ANIMEMOVIE: function (title, releaseDate, country, duration) {
    return `
╭─── ⛩️ *DANIEWATCH ANIME* 🌸 ───╮

┌─❒ *Anime Details*
│ ✨ *Title:* ${title}
│ 📅 *Release Date:* ${releaseDate}
│ 🌍 *Country:* ${country}
│ ⏳ *Duration:* ${duration}
└───────────────
`.trim();
  },
  BAISCOMOVIE: function (title, year, rating, duration) {
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Movie Details*
│ 🎞️ *Title:* ${title}
│ 📅 *Release Date:* ${year}
│ ⭐ *Rating:* ${rating}
│ ⏳ *Duration:* ${duration}
└───────────────
`.trim();
  },
  ADULTMOVIE: function (title, rating, description) {
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Movie Details*
│ ✨ *Title:* ${title}
│ ⭐ *Rating:* ${rating}
└───────────────

📝 *Description:*
${description || "No description available"}

⚡ *Downloading media...*
`.trim();
  },
  ANIMOMOVIE: function (movieData) {
    return `
╭─── ⛩️ *DANIEWATCH ANIME* 🌸 ───╮

┌─❒ *Anime Info*
│ ✨ *Title:* ${movieData.title}
│ ⭐ *Description:* ${movieData.description}
└───────────────

📝 *Plot:*
${movieData.plot || "N/A"}
`.trim();
  },
  FILMPOMOVIE: function (title, rating, year, duration) {
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Movie Info*
│ ✨ *Title:* ${title}
│ ⭐ *IMDB Rating:* ${rating}
│ 📅 *Release Date:* ${year}
│ ⏳ *Duration:* ${duration}
└───────────────
`.trim();
  },
  //=====================youtube===========================================
  SONG: function (data) {
    return `
╭─── 🎵 *DANIEWATCH MUSIC* 🎧 ───╮

┌─❒ *Song Found*
│ 🎶 *Title:* ${data.title}
│ ⏱️ *Duration:* ${data.timestamp}
│ 👁️ *Views:* ${typeof data.views === 'number' ? data.views.toLocaleString() : data.views}
│ 📅 *Uploaded On:* ${data.ago}
│ 🔗 *Link:* ${data.url}
└───────────────

🎧 _Enjoy your music with DanieWatch Downloader Bot!_
`.trim();
  },
  YTMP3: function (data) {
    return `
╭─── 🎵 *DANIEWATCH AUDIO* 🎧 ───╮

┌─❒ *Audio Details*
│ 🎶 *Title:* ${data.title}
│ ⏱️ *Duration:* ${data.timestamp}
│ 👁️ *Views:* ${typeof data.views === 'number' ? data.views.toLocaleString() : data.views}
│ 📅 *Uploaded On:* ${data.ago}
│ 🔗 *Link:* ${data.url}
└───────────────

🎧 _Brought to you by DanieWatch Downloader Bot!_
`.trim();
  },
  VIDEO: function (data) {
    return `
╭─── 🎬 *DANIEWATCH VIDEO* 🎥 ───╮

┌─❒ *Video Details*
│ 🎥 *Title:* ${data.title}
│ ⏱️ *Duration:* ${data.timestamp}
│ 👁️ *Views:* ${typeof data.views === 'number' ? data.views.toLocaleString() : data.views}
│ 📅 *Uploaded On:* ${data.ago}
│ 🔗 *Link:* ${data.url}
└───────────────

🎬 _Enjoy your video with DanieWatch Downloader Bot!_
`.trim();
  },
  YTMP4: function (data) {
    return `
╭─── 🎬 *DANIEWATCH MP4* 🎥 ───╮

┌─❒ *MP4 Video Track*
│ 🎥 *Title:* ${data.title}
│ ⏱️ *Duration:* ${data.timestamp}
│ 👁️ *Views:* ${typeof data.views === 'number' ? data.views.toLocaleString() : data.views}
│ 📅 *Uploaded On:* ${data.ago}
│ 🔗 *Link:* ${data.url}
└───────────────

🎬 _Enjoy your video with DanieWatch Downloader Bot!_
`.trim();
  },
  //=====================hiru news===========================================
  AUTONEWS: function (source, newsData, isGroup, groupMetadata, conf) {
    return `
╭─── 📰 *DANIEWATCH NEWS* 🗞️ ───╮

📌 *Source:* ${source.toUpperCase()} News Update
📌 *Title:* ${newsData.title}
📅 *Date:* ${newsData.date || "N/A"}

📝 *Description:*
${newsData.desc || "No details available"}
${isGroup ? `\n📨 *Shared In:* ${groupMetadata?.subject || "Group"}\n🛡️ *Admin:* ${conf.MNAME}\n` : ""}
🔗 *Read more:* ${newsData.url}
`.trim();
  },
  AUTOMOVIE: function (title, rating, metadata, description, isGroup, groupMetadata, conf) {
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Movie Details*
│ ✨ *Movie Name:* ${title}
│ ⭐ *IMDB Rating:* ${rating?.value || "N/A"} ★
│ 📆 *Release Date:* ${metadata?.releaseDate || "N/A"}
│ 🌐 *Country:* ${metadata?.country || "N/A"}
│ ⏱️ *Duration:* ${metadata?.runtime || "N/A"}
│ 🎭 *Genres:* ${metadata?.genres?.map(g => `#${g}`).join(" • ") || "N/A"}
└───────────────
${isGroup ? `\n📨 *Shared In:* ${groupMetadata?.subject || "Group"}\n🛡️ *Admin:* ${conf.MNAME}\n` : ""}
📝 *Summary:*
${description || "— No details available —"}
`.trim();
  },
  AUTOSONG: function (foundSong, currentArtist, nextArtist, config, botNumber, isGroup, groupMetadata) {
    return `
╭─── ✨ *DANIEWATCH MUSIC* 🎧 ───╮

┌─❒ *Song Details*
│ 🎶 *Title:* ${foundSong.title}
│ 👤 *Artist:* ${currentArtist.replace(" original", "")}
│ ⏱️ *Duration:* ${foundSong.timestamp || "N/A"}
│ 👁️ *Views:* ${foundSong.views ? foundSong.views.toLocaleString() : "N/A"}
│ 📅 *Uploaded:* ${foundSong.ago || "N/A"}
│ ⏭️ *Next Artist:* ${nextArtist}
└───────────────

📌 *YouTube Link:* 
${foundSong.url}
${isGroup ? `
┌─❒ *Group Info*
│ 👥 *Name:* ${groupMetadata?.subject || "Group"}
│ 🛡️ *Admin:* ${config.MNAME}
│ 🤖 *Bot Number:* ${botNumber}
└───────────────
` : ""}
${config.FOOTER || "🎼 Enjoy the music! 🎧"}`.trim();
  },
  AIMODEPROMPT: function (userMessage) {
    return `
You're an advanced AI assistant called "DanieWatch AI." You're professional, respectful, and knowledgeable, always ready to assist with expertise. 👑 Your goal is to provide helpful, accurate, and engaging responses while maintaining a courteous tone.

User Message: {${userMessage}}`;
  },
  MVDL_SEARCH_PROMPT: `╭─── 🔍 *DANIEWATCH SEARCH* 🔍 ───╮\n\n📌 *Please provide a search query!*\nExample: \`.movie deadpool\``,
  MVDL_SEARCH_RESULTS: function (query) {
    return `╭─── 🎬 *SEARCH RESULTS* 🎬 ───╮\n\n🔍 *Results for:* "${query.toUpperCase()}"\n───────────────`;
  },
  MVDL_SEARCH_FAILED: "❌ *Failed to fetch search results! Please try again later.*",
  MVDL_INVALID_REQUEST: "❌ *Invalid download request!*",
  MVDL_MOVIE_INFO: function (movie, isMovie, genres, duration, rating, dubs, cast) {
    return `
╭─── 🎬 *DANIEWATCH CINEMA* 🍿 ───╮

┌─❒ *Title Details*
│ 📝 *Title:* ${movie.title}
│ 🎭 *Type:* ${isMovie ? "Movie" : "TV Series"}
│ 🎭 *Genres:* ${genres}
│ ⏱️ *Duration:* ${duration}
│ ⭐ *IMDB Rating:* ${rating}
│ 🌐 *Languages:* ${dubs}
│ 👥 *Cast:* ${cast}
└───────────────

📝 *Summary:*
${movie.description || "— No summary available —"}
`.trim();
  },
  MVDL_CHOOSE_QUALITY: "\n\n📥 *Select a quality option below to start download:*",
  MVDL_NO_SEASONS: "❌ *No seasons found for this TV Series!*",
  MVDL_CHOOSE_SEASON: "\n\n📺 *Choose a Season below to view episodes:*",
  MVDL_INFO_FAILED: "❌ *Failed to fetch movie/show details!*",
  MVDL_SEASON_CAPTION: function (movie, seasonNumber, maxEpisode) {
    return `
╭─── 📺 *DANIEWATCH TV SHOW* 🍿 ───╮

┌─❒ *Season Details*
│ 🎬 *Title:* ${movie.title}
│ 📅 *Season:* ${seasonNumber}
│ 🎞️ *Total Episodes:* ${maxEpisode}
└───────────────
`.trim();
  },
  MVDL_SEASON_FAILED: "❌ *Failed to load season details!*",
  MVDL_EPISODE_CAPTION: function (movie, seasonNumber, episodeNumber) {
    return `
╭─── 📺 *DANIEWATCH TV SHOW* 🍿 ───╮

┌─❒ *Episode Details*
│ 🎬 *Title:* ${movie.title}
│ 📅 *Season:* ${seasonNumber}
│ 🎞️ *Episode:* ${episodeNumber}
└───────────────
`.trim();
  },
  MVDL_EPISODE_FAILED: "❌ *Failed to load episode download options!*",
  MVDL_MOVIE_CARD: function (movie, quality, size, season, episode, format) {
    return `
╭─── 📥 *DANIEWATCH DOWNLOADER* 🚀 ───╮

┌─❒ *Download Card*
│ 🎬 *File Name:* ${movie.title}
│ 💿 *Quality:* ${quality}
│ 💾 *Size:* ${size}
${season ? `│ 📅 *Season:* ${season}\n│ 🎞️ *Episode:* ${episode}\n` : ""}└───────────────

⚡ *Sending file, please wait...*
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
