const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const teams = require('../data/iplTeams.json');
const players = require('../data/iplPlayers.json');

const app = express();
const pickPortFromArgs = () => {
  const arg = process.argv.slice(2).find((value) => /^\d+$/.test(value));
  if (!arg) {
    return undefined;
  }

  const parsed = Number.parseInt(arg, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const pickPortFromEnv = () => {
  const { PORT: envPort } = process.env;
  if (!envPort) {
    return undefined;
  }

  const parsed = Number.parseInt(envPort, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const PORT = pickPortFromArgs() ?? pickPortFromEnv() ?? 9000;
const publicDir = path.join(__dirname, '..', 'public');
const playersDir = path.join(publicDir, 'players');
const playersDataPath = path.join(__dirname, '..', 'data', 'iplPlayers.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicDir));

const slugify = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'player';

const mapMimeToExtension = (mime = '') => {
  switch (mime) {
    case 'image/svg+xml':
      return '.svg';
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/png':
    default:
      return '.png';
  }
};

app.get('/health', (req, res) => {
  res.json({
    info: 'Cricket Roaster Application',
    datetime: new Date().toISOString()
  });
});

// Provides static 2025 IPL roster information
app.get('/teams', (req, res) => {
  res.json({ teams });
});

// Returns all player entries
app.get('/players/all', (req, res) => {
  res.json({ players });
});

// Returns players grouped by team name
app.get('/players/grouped', (req, res) => {
  const groupedMap = players.reduce((acc, player) => {
    acc[player.teamName] = acc[player.teamName] || [];
    acc[player.teamName].push(player);
    return acc;
  }, {});

  const groupedArray = Object.entries(groupedMap).map(([teamName, members]) => ({
    teamName,
    members
  }));

  res.json(groupedArray);
});

// Returns player basics for a given team
app.get('/players', (req, res) => {
  const { teamName } = req.query;

  if (!teamName || typeof teamName !== 'string') {
    return res.status(400).json({ message: 'teamName query parameter is required' });
  }

  const normalized = teamName.trim().toLowerCase();
  const roster = players.filter(
    (player) => player.teamName.toLowerCase() === normalized
  );

  if (!roster.length) {
    return res.status(404).json({ message: `No players found for team ${teamName}` });
  }

  const playerSummaries = roster.map(({ playerName, image, role, uniquePlayerId }) => ({
    playerName,
    image,
    role, 
    uniquePlayerId
  }));

  res.json({ teamName: roster[0].teamName, players: playerSummaries });
});

// Fetch full player info by unique identifier
app.get('/players/:uniquePlayerId', (req, res) => {
  const { uniquePlayerId } = req.params;
  const player = players.find(
    (entry) => entry.uniquePlayerId.toLowerCase() === uniquePlayerId.toLowerCase()
  );

  if (!player) {
    return res.status(404).json({ message: `Player with id ${uniquePlayerId} not found` });
  }

  res.json(player);
});

// Add a new player to the roster
app.post('/players', async (req, res) => {
  const requiredFields = [
    'playerName',
    'role',
    'teamName',
    'countryName',
    'age',
    'battingSyle',
    'uniquePlayerId',
    'runsScored',
    'centuriesScored',
    'wicketsTaken',
    'image'
  ];

  const missing = requiredFields.filter((field) => req.body[field] === undefined);
  if (missing.length) {
    return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
  }

  const {
    playerName,
    image,
    role,
    teamName,
    countryName,
    age,
    battingSyle,
    uniquePlayerId,
    runsScored,
    centuriesScored,
    wicketsTaken
  } = req.body;

  const duplicate = players.find(
    (player) =>
      player.uniquePlayerId.toLowerCase() === uniquePlayerId.toLowerCase() ||
      player.playerName.toLowerCase() === playerName.toLowerCase()
  );

  if (duplicate) {
    return res.status(400).json({ message: 'Player already exists' });
  }

  try {
    let base64Payload = image;
    let extension = '.png';

    const dataUrlMatch = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(image);
    if (dataUrlMatch) {
      extension = mapMimeToExtension(dataUrlMatch[1]);
      base64Payload = dataUrlMatch[2];
    }

    const imageBuffer = Buffer.from(base64Payload, 'base64');
    const fileName = `${slugify(playerName)}${extension}`;
    const relativePath = `/players/${fileName}`;
    const absolutePath = path.join(playersDir, fileName);

    await fs.mkdir(playersDir, { recursive: true });
    await fs.writeFile(absolutePath, imageBuffer);

    const newPlayer = {
      playerName,
      image: relativePath,
      role,
      teamName,
      countryName,
      age,
      battingSyle,
      uniquePlayerId,
      runsScored,
      centuriesScored,
      wicketsTaken
    };

    players.push(newPlayer);
    await fs.writeFile(playersDataPath, JSON.stringify(players, null, 2));

    res.status(201).json(newPlayer);
  } catch (error) {
    console.error('Failed to add player', error);
    res.status(500).json({ message: 'Failed to add player', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Cricket roster API listening on port ${PORT}`);
});
