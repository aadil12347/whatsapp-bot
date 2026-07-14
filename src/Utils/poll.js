// src/Utils/poll.js
const fs = require('fs');
const path = require('path');
const POLLS_FILE = path.join(__dirname, '../../polls.json');
let pollsCache = {};

function loadPolls() {
  try {
    if (fs.existsSync(POLLS_FILE)) {
      const data = fs.readFileSync(POLLS_FILE, 'utf-8');
      pollsCache = JSON.parse(data);
    } else {
      pollsCache = {};
      savePolls();
    }
  } catch (err) {
    console.error('Failed to load polls.json:', err);
    pollsCache = {};
  }
}

function savePolls() {
  try {
    fs.writeFileSync(POLLS_FILE, JSON.stringify(pollsCache, null, 2));
  } catch (err) {
    console.error('Failed to save polls.json:', err);
  }
}

function savePoll(pollMsgId, mapping) {
  pollsCache[pollMsgId] = mapping;
  savePolls();
}

function getPoll(pollMsgId) {
  return pollsCache[pollMsgId] || null;
}

function deletePoll(pollMsgId) {
  if (pollsCache[pollMsgId]) {
    delete pollsCache[pollMsgId];
    savePolls();
  }
}

module.exports = { loadPolls, savePolls, savePoll, getPoll, deletePoll };