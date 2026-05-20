#!/usr/bin/env node
"use strict";

const http = require("http");
const path = require("path");
const {
  RedisClient,
  formatError,
  getRedisUrl,
  loadDotEnv,
  nowIso,
} = require("./scorecard_flow");

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getPath(value, pathValue) {
  const parts = Array.isArray(pathValue)
    ? pathValue
    : String(pathValue).split(".");
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    current = current[part];
  }
  return current;
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function toScoreValue(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && String(numeric) === trimmed
      ? numeric
      : trimmed;
  }
  return null;
}

function cleanValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    const cleanedArray = value
      .map((item) => cleanValue(item))
      .filter((item) => item !== undefined);
    return cleanedArray.length ? cleanedArray : undefined;
  }
  if (isPlainObject(value)) {
    const cleanedObject = {};
    for (const [key, item] of Object.entries(value)) {
      const cleanedItem = cleanValue(item);
      if (cleanedItem !== undefined) cleanedObject[key] = cleanedItem;
    }
    return Object.keys(cleanedObject).length ? cleanedObject : undefined;
  }
  return value;
}

function cleanObject(value) {
  return cleanValue(value) || {};
}

function findFirstObject(root, predicate, maxDepth = 8) {
  const seen = new Set();

  function visit(value, depth) {
    if (!value || typeof value !== "object") return null;
    if (seen.has(value)) return null;
    seen.add(value);

    if (predicate(value, depth)) return value;
    if (depth >= maxDepth) return null;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const item of Object.values(value)) {
      const found = visit(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  return visit(root, 0);
}

function formatElapsed(secondsValue) {
  const seconds = toNumber(secondsValue);
  if (seconds === null) return null;
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secondsPart = String(total % 60).padStart(2, "0");
  return `${minutes}:${secondsPart}`;
}

function formatStatus(status) {
  if (!status) return null;
  if (typeof status === "string") return toText(status);
  return firstValue(
    toText(status.name),
    toText(status.label),
    toText(status.description),
    toText(status.desc),
    status._id !== undefined ? String(status._id) : null,
    status.id !== undefined ? String(status.id) : null,
    status.code !== undefined ? String(status.code) : null,
  );
}

function formatScoreLine(homeScore, awayScore, separator = "-") {
  if (
    (homeScore === null || homeScore === undefined) &&
    (awayScore === null || awayScore === undefined)
  ) {
    return null;
  }
  const home = homeScore !== null && homeScore !== undefined ? homeScore : "?";
  const away = awayScore !== null && awayScore !== undefined ? awayScore : "?";
  return `${home}${separator}${away}`;
}

function formatTennisDisplayScore(homeSets, awaySets, sets) {
  const normalizedSets = Array.isArray(sets) ? sets : [];
  const latestSet = [...normalizedSets]
    .reverse()
    .find(
      (set) =>
        set &&
        (set.home !== null && set.home !== undefined) &&
        (set.away !== null && set.away !== undefined),
    );

  if (latestSet) {
    const displayHomeSets =
      homeSets !== null && homeSets !== undefined ? homeSets : "?";
    const displayAwaySets =
      awaySets !== null && awaySets !== undefined ? awaySets : "?";
    return `(${displayHomeSets}) ${latestSet.home} - ${latestSet.away} (${displayAwaySets})`;
  }

  return formatScoreLine(homeSets, awaySets);
}

function resolveSideEntity(match, side, payload) {
  return firstValue(
    getPath(match, ["teams", side]),
    getPath(match, [side]),
    getPath(payload, ["teams", side]),
    getPath(payload, [side]),
  );
}

function resolveSideName(entity, fallback) {
  return firstValue(
    entity && toText(entity.name),
    entity && toText(entity.shortName),
    entity && toText(entity.shortname),
    entity && toText(entity.abbr),
    entity && toText(entity.teamName),
    fallback || null,
  );
}

function resolveSideId(entity) {
  return firstValue(
    entity && toText(entity.uid),
    entity && toText(entity._id),
    entity && toText(entity.id),
  );
}

function resolveSideScore(entity, side, match, payload) {
  const direct = firstValue(
    entity && toScoreValue(entity.score),
    entity && toScoreValue(entity.result),
    entity && toScoreValue(entity.goals),
    entity && toScoreValue(entity.runs),
    entity && toScoreValue(entity.points),
    entity && toScoreValue(entity.games),
    entity && toScoreValue(entity.setsWon),
    entity && toScoreValue(entity.setswon),
    entity && toScoreValue(entity.displayScore),
    entity && toScoreValue(entity.currentScore),
  );
  if (direct !== null) return direct;

  return firstValue(
    toScoreValue(getPath(match, ["score", side])),
    toScoreValue(getPath(match, ["scores", side])),
    toScoreValue(getPath(match, ["result", side])),
    toScoreValue(getPath(match, ["results", side])),
    toScoreValue(getPath(match, ["gameScore", side])),
    toScoreValue(getPath(match, ["game_score", side])),
    toScoreValue(getPath(match, ["setScore", side])),
    toScoreValue(getPath(match, ["set_score", side])),
    toScoreValue(getPath(payload, ["score", side])),
    toScoreValue(getPath(payload, ["scores", side])),
    toScoreValue(getPath(payload, ["result", side])),
    toScoreValue(getPath(payload, ["results", side])),
  );
}

function normalizeSideTuple(item) {
  if (!item || typeof item !== "object") return null;

  const home = firstValue(
    toScoreValue(item.home),
    toScoreValue(item.homeScore),
    toScoreValue(item.home_score),
    toScoreValue(item.team1),
    toScoreValue(item.team1Score),
    toScoreValue(item.competitor1),
    toScoreValue(item.first),
    toScoreValue(item.left),
    toScoreValue(item.a),
  );
  const away = firstValue(
    toScoreValue(item.away),
    toScoreValue(item.awayScore),
    toScoreValue(item.away_score),
    toScoreValue(item.team2),
    toScoreValue(item.team2Score),
    toScoreValue(item.competitor2),
    toScoreValue(item.second),
    toScoreValue(item.right),
    toScoreValue(item.b),
  );

  if (home === null && away === null) return null;
  return cleanObject({ home, away });
}

function extractStructuredArray(match, payload, pathCandidates) {
  for (const candidate of pathCandidates) {
    const value = firstValue(getPath(match, candidate), getPath(payload, candidate));
    if (!Array.isArray(value) || !value.length) continue;
    const normalized = value
      .map((item) => normalizeSideTuple(item))
      .filter(Boolean);
    if (normalized.length) return normalized;
  }
  return [];
}

function extractCurrentGame(match, payload) {
  const value = firstValue(
    getPath(match, "currentGame"),
    getPath(match, "current_game"),
    getPath(match, "gameScore"),
    getPath(match, "game_score"),
    getPath(payload, "currentGame"),
    getPath(payload, "current_game"),
    getPath(payload, "gameScore"),
    getPath(payload, "game_score"),
  );
  if (!value) return null;
  return normalizeSideTuple(value);
}

function detectServingSide(value, homeEntity, awayEntity) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "home" || normalized.includes("home")) return "home";
    if (normalized === "away" || normalized.includes("away")) return "away";

    const homeId = resolveSideId(homeEntity);
    const awayId = resolveSideId(awayEntity);
    const homeName = resolveSideName(homeEntity);
    const awayName = resolveSideName(awayEntity);

    if (
      homeId &&
      (normalized === homeId.toLowerCase() ||
        normalized.includes(homeId.toLowerCase()))
    ) {
      return "home";
    }
    if (
      awayId &&
      (normalized === awayId.toLowerCase() ||
        normalized.includes(awayId.toLowerCase()))
    ) {
      return "away";
    }
    if (homeName && normalized.includes(homeName.toLowerCase())) return "home";
    if (awayName && normalized.includes(awayName.toLowerCase())) return "away";
    return null;
  }

  if (isPlainObject(value)) {
    return detectServingSide(
      firstValue(value.side, value.team, value.uid, value._id, value.id, value.name),
      homeEntity,
      awayEntity,
    );
  }

  return null;
}

function inferTennisFromPayload(match, payload) {
  if (
    extractStructuredArray(match, payload, [
      "sets",
      "setScores",
      "set_scores",
      "result.sets",
      "score.sets",
      "scores.sets",
    ]).length
  ) {
    return true;
  }

  if (extractCurrentGame(match, payload)) return true;

  const serving = firstValue(
    getPath(match, "serving"),
    getPath(match, "server"),
    getPath(match, "servingSide"),
    getPath(match, "serving_side"),
    getPath(payload, "serving"),
    getPath(payload, "server"),
    getPath(payload, "servingSide"),
    getPath(payload, "serving_side"),
  );
  return serving !== null;
}

function findTennisState(payload) {
  return findFirstObject(
    payload,
    (value) =>
      value &&
      typeof value === "object" &&
      value._doc === "tennis_state" &&
      isPlainObject(value.score),
  );
}

function computeSetWins(sets, side) {
  if (!sets.length) return null;
  const key = side === "home" ? "home" : "away";
  const otherKey = side === "home" ? "away" : "home";
  let wins = 0;
  let hasComparableSet = false;

  for (const set of sets) {
    const current = toNumber(set[key]);
    const other = toNumber(set[otherKey]);
    if (current === null || other === null) continue;
    hasComparableSet = true;
    if (current > other) wins += 1;
  }

  return hasComparableSet ? wins : null;
}

function findCricketScore(payload) {
  return findFirstObject(
    payload,
    (value) =>
      Array.isArray(value.innings) &&
      value.innings.length &&
      (value.matchTitle || value.matchCommentary || value.matchStatus !== undefined),
  );
}

function formatCricketInnings(innings) {
  const wickets = toNumber(innings && innings.wickets);
  const runs = toNumber(innings && innings.runs);
  return firstValue(
    runs !== null && wickets !== null
      ? `${runs}/${wickets}`
      : runs !== null
        ? String(runs)
        : toText(innings.summary),
  );
}

function normalizeComparableText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCricketMatchTitleTeams(matchTitle) {
  const title = toText(matchTitle);
  if (!title) return [];

  const cleaned = title.replace(/\s+\([^)]*\)\s*$/, "").trim();
  const simpleSplit = cleaned.split(/\s+v(?:s|\.)?\s+/i);
  if (simpleSplit.length >= 2) {
    return simpleSplit
      .slice(0, 2)
      .map((part) => toText(part))
      .filter(Boolean);
  }

  return [];
}

function findLatestCricketInningsForTeam(innings, teamName) {
  const targetName = normalizeComparableText(teamName);
  if (!targetName) return null;

  let fallback = null;
  for (const inningsItem of innings) {
    const inningsTeamName = toText(inningsItem && inningsItem.teamName);
    if (!inningsTeamName) continue;
    const normalizedInningsName = normalizeComparableText(inningsTeamName);
    if (normalizedInningsName === targetName) {
      fallback = inningsItem;
      continue;
    }
    if (
      normalizedInningsName.includes(targetName) ||
      targetName.includes(normalizedInningsName)
    ) {
      fallback = inningsItem;
    }
  }
  return fallback;
}

function buildCricketSide(teamName, inningsItem, fallbackName) {
  if (!teamName && !inningsItem) return undefined;
  return cleanObject({
    name: teamName || resolveSideName(inningsItem, fallbackName),
    score: inningsItem ? formatCricketInnings(inningsItem) : null,
    runs: inningsItem ? toNumber(inningsItem.runs) : null,
    wickets: inningsItem ? toNumber(inningsItem.wickets) : null,
    overs: inningsItem ? toNumber(inningsItem.overs) : null,
  });
}

function normalizeCricketScore(payload, eventId) {
  const score = findCricketScore(payload);
  if (!score) return null;

  const innings = Array.isArray(score.innings) ? score.innings : [];
  const titleTeams = parseCricketMatchTitleTeams(score.matchTitle);
  const firstTitleTeam = titleTeams[0] || null;
  const secondTitleTeam = titleTeams[1] || null;

  const firstInnings =
    findLatestCricketInningsForTeam(innings, firstTitleTeam) || innings[0] || null;
  const secondInnings =
    findLatestCricketInningsForTeam(innings, secondTitleTeam) || innings[1] || null;
  const targetInnings =
    [...innings].reverse().find((item) => toNumber(item && item.target) !== null) ||
    secondInnings;

  return cleanObject({
    eventId: String(eventId),
    sport: "cricket",
    status: firstValue(
      toText(score.matchCommentary),
      toText(score.matchTitle),
      score.matchStatus !== undefined ? String(score.matchStatus) : null,
    ),
    home: buildCricketSide(
      firstTitleTeam,
      firstInnings,
      firstTitleTeam || "Team 1",
    ),
    away: buildCricketSide(
      secondTitleTeam,
      secondInnings,
      secondTitleTeam || "Team 2",
    ),
    score: [
      firstInnings ? formatCricketInnings(firstInnings) : null,
      secondInnings ? formatCricketInnings(secondInnings) : null,
    ]
      .filter(Boolean)
      .join(" vs "),
    details: cleanValue({
      currentInnings: toNumber(score.currentInningsNumber),
      target: targetInnings ? toNumber(targetInnings.target) : null,
      summary: toText(score.matchTitle),
    }),
  });
}

function findGenericMatch(payload) {
  return (
    findFirstObject(
      payload,
      (value) =>
        isPlainObject(value.teams) &&
        isPlainObject(value.teams.home) &&
        isPlainObject(value.teams.away),
    ) ||
    findFirstObject(
      payload,
      (value) =>
        isPlainObject(value.home) &&
        isPlainObject(value.away) &&
        (value.status || value.timeinfo || value.score || value.result),
    )
  );
}

function normalizeSoccerScore(match, payload, eventId) {
  const homeEntity = resolveSideEntity(match, "home", payload);
  const awayEntity = resolveSideEntity(match, "away", payload);
  const homeScore = resolveSideScore(homeEntity, "home", match, payload);
  const awayScore = resolveSideScore(awayEntity, "away", match, payload);
  const periodScores = extractStructuredArray(match, payload, [
    "periodScores",
    "period_scores",
    "periods",
    "score.periods",
    "result.periods",
  ]);

  return cleanObject({
    eventId: String(eventId),
    sport: "soccer",
    status: formatStatus(match.status),
    timeElapsed: firstValue(
      formatElapsed(getPath(match, "timeinfo.played")),
      formatElapsed(getPath(match, "timeinfo.elapsed")),
      formatElapsed(getPath(match, "ptime")),
    ),
    home: {
      name: resolveSideName(homeEntity, "Home"),
      score: homeScore,
    },
    away: {
      name: resolveSideName(awayEntity, "Away"),
      score: awayScore,
    },
    score: formatScoreLine(homeScore, awayScore),
    details: cleanValue({
      periodScores,
    }),
  });
}

function normalizeTennisScore(match, payload, eventId) {
  const homeEntity = resolveSideEntity(match, "home", payload);
  const awayEntity = resolveSideEntity(match, "away", payload);
  const sets = extractStructuredArray(match, payload, [
    "sets",
    "setScores",
    "set_scores",
    "result.sets",
    "score.sets",
    "scores.sets",
  ]);
  const currentGame = extractCurrentGame(match, payload);
  const serving = detectServingSide(
    firstValue(
      getPath(match, "serving"),
      getPath(match, "server"),
      getPath(match, "servingSide"),
      getPath(match, "serving_side"),
      getPath(payload, "serving"),
      getPath(payload, "server"),
      getPath(payload, "servingSide"),
      getPath(payload, "serving_side"),
    ),
    homeEntity,
    awayEntity,
  );

  let homeScore = resolveSideScore(homeEntity, "home", match, payload);
  let awayScore = resolveSideScore(awayEntity, "away", match, payload);

  if (homeScore === null || awayScore === null) {
    const computedHomeWins = computeSetWins(sets, "home");
    const computedAwayWins = computeSetWins(sets, "away");
    if (homeScore === null) homeScore = computedHomeWins;
    if (awayScore === null) awayScore = computedAwayWins;
  }

  return cleanObject({
    eventId: String(eventId),
    sport: "tennis",
    status: formatStatus(match.status),
    home: {
      name: resolveSideName(homeEntity, "Player 1"),
      score: homeScore,
    },
    away: {
      name: resolveSideName(awayEntity, "Player 2"),
      score: awayScore,
    },
    score: formatTennisDisplayScore(homeScore, awayScore, sets),
    details: cleanValue({
      sets,
      currentGame,
      serving,
    }),
  });
}

function normalizeTennisStateScore(state, eventId) {
  const homeScore = toScoreValue(getPath(state, "score.home"));
  const awayScore = toScoreValue(getPath(state, "score.away"));
  const sets = extractStructuredArray(state, state, ["periods"]);
  const setsWithMeta = Array.isArray(state.periods)
    ? state.periods.map((item) =>
        cleanObject({
          home: toScoreValue(item.home),
          away: toScoreValue(item.away),
          number: toNumber(item.number),
          tiebreak: item.tiebreak
            ? cleanObject({
                home: toScoreValue(item.tiebreak.home),
                away: toScoreValue(item.tiebreak.away),
                number: toNumber(item.tiebreak.number),
                type: toText(item.tiebreak.type),
                tiebreakType: toText(item.tiebreak.tiebreak_type),
              })
            : undefined,
        }),
      )
    : [];

  return cleanObject({
    eventId: String(eventId),
    sport: "tennis",
    status: formatStatus(state.status),
    home: {
      name: "Home",
      score: homeScore,
    },
    away: {
      name: "Away",
      score: awayScore,
    },
    score: formatTennisDisplayScore(
      homeScore,
      awayScore,
      setsWithMeta.length ? setsWithMeta : sets,
    ),
    details: cleanValue({
      sets: setsWithMeta.length ? setsWithMeta : sets,
      serving: detectServingSide(state.serving, null, null) || toText(state.serving),
    }),
  });
}

function normalizeScorePayload(payload, eventId) {
  const cricket = normalizeCricketScore(payload, eventId);
  if (cricket) return cricket;

  const tennisState = findTennisState(payload);
  if (tennisState) {
    return normalizeTennisStateScore(tennisState, eventId);
  }

  const match = findGenericMatch(payload);
  if (!match) {
    throw new Error("Unsupported payload shape");
  }

  if (inferTennisFromPayload(match, payload)) {
    return normalizeTennisScore(match, payload, eventId);
  }

  return normalizeSoccerScore(match, payload, eventId);
}

function writeJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function createResponseEnvelope(statusCode, body) {
  return { statusCode, body };
}

function parseRequestedEventIds(rawValue, maxItems = 50) {
  const items = String(rawValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!items.length) {
    return createResponseEnvelope(400, {
      error: "Missing eventId",
      expected:
        "/get-score/:eventId, /get-score/:eventId1,:eventId2, /get-event-data/:eventId",
    });
  }

  if (items.length > maxItems) {
    return createResponseEnvelope(400, {
      error: `Too many eventIds. Maximum allowed is ${maxItems}`,
      count: items.length,
      maxItems,
    });
  }

  return createResponseEnvelope(200, items);
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  const workers = new Array(Math.max(1, limit)).fill(null).map(async () => {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function loadScoreEnvelope(redis, eventId) {
  const key = `scorecard_data:sky:${eventId}`;

  let raw;
  try {
    raw = await redis.get(key);
  } catch (err) {
    return createResponseEnvelope(500, {
      error: "Redis read failed",
      detail: formatError(err),
    });
  }

  if (!raw) {
    return createResponseEnvelope(404, {
      error: "Score not found",
      eventId,
      key,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return createResponseEnvelope(500, {
      error: "Stored payload is not valid JSON",
      eventId,
      detail: formatError(err),
    });
  }

  try {
    return createResponseEnvelope(200, normalizeScorePayload(parsed, eventId));
  } catch (err) {
    return createResponseEnvelope(500, {
      error: "Failed to normalize score",
      eventId,
      detail: formatError(err),
    });
  }
}

async function loadEventDataEnvelope(redis, eventId) {
  const key = `scorecard_data:sky:${eventId}`;

  let raw;
  try {
    raw = await redis.get(key);
  } catch (err) {
    return createResponseEnvelope(500, {
      error: "Redis read failed",
      detail: formatError(err),
    });
  }

  if (!raw) {
    return createResponseEnvelope(404, {
      error: "Event data not found",
      eventId,
      key,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return createResponseEnvelope(500, {
      error: "Stored payload is not valid JSON",
      eventId,
      detail: formatError(err),
    });
  }

  return createResponseEnvelope(200, parsed);
}

function createEventCache(loadEnvelope, options = {}) {
  const cacheTtlMs = Math.max(
    0,
    Math.floor(toNumber(options.cacheTtlMs) ?? 1000),
  );
  const missTtlMs = Math.max(
    0,
    Math.floor(toNumber(options.missTtlMs) ?? cacheTtlMs),
  );
  const maxEntries = Math.max(
    1,
    Math.floor(toNumber(options.maxEntries) ?? 5000),
  );

  const cache = new Map();
  const inFlight = new Map();

  function getCached(eventId) {
    const entry = cache.get(eventId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(eventId);
      return null;
    }
    return entry.envelope;
  }

  function setCached(eventId, envelope, ttlMs) {
    if (ttlMs <= 0) return;
    if (cache.has(eventId)) cache.delete(eventId);
    cache.set(eventId, {
      envelope,
      expiresAt: Date.now() + ttlMs,
    });
    while (cache.size > maxEntries) {
      const firstKey = cache.keys().next().value;
      if (firstKey === undefined) break;
      cache.delete(firstKey);
    }
  }

  async function get(eventId) {
    const cached = getCached(eventId);
    if (cached) return cached;

    const existing = inFlight.get(eventId);
    if (existing) return existing;

    const promise = loadEnvelope(eventId)
      .then((envelope) => {
        if (envelope.statusCode === 200) {
          setCached(eventId, envelope, cacheTtlMs);
        } else if (envelope.statusCode === 404) {
          setCached(eventId, envelope, missTtlMs);
        }
        return envelope;
      })
      .finally(() => {
        if (inFlight.get(eventId) === promise) {
          inFlight.delete(eventId);
        }
      });

    inFlight.set(eventId, promise);
    return promise;
  }

  return {
    get,
  };
}

function createScoreCache(redis, options = {}) {
  return createEventCache(
    (eventId) => loadScoreEnvelope(redis, eventId),
    options,
  );
}

function createEventDataCache(redis, options = {}) {
  return createEventCache(
    (eventId) => loadEventDataEnvelope(redis, eventId),
    options,
  );
}

function batchResultFromEnvelope(eventId, envelope) {
  if (envelope.statusCode === 200) {
    return envelope.body;
  }
  return {
    eventId,
    statusCode: envelope.statusCode,
    ...(envelope.body || {}),
  };
}

async function handleEventRequest({
  res,
  rawIds,
  cache,
  maxBatchItems,
  batchConcurrency,
}) {
  const parsedIds = parseRequestedEventIds(rawIds, maxBatchItems);
  if (parsedIds.statusCode !== 200) {
    writeJson(res, parsedIds.statusCode, parsedIds.body);
    return;
  }

  const eventIds = parsedIds.body;
  if (eventIds.length === 1) {
    const envelope = await cache.get(eventIds[0]);
    writeJson(res, envelope.statusCode, envelope.body);
    return;
  }

  const results = await mapLimit(eventIds, batchConcurrency, async (eventId) =>
    batchResultFromEnvelope(eventId, await cache.get(eventId)),
  );
  writeJson(res, 200, results);
}

function createRequestHandler(scoreCache, eventDataCache) {
  const maxBatchItems = Math.max(
    1,
    Math.floor(toNumber(process.env.SCORE_BATCH_MAX_ITEMS) ?? 50),
  );
  const batchConcurrency = Math.max(
    1,
    Math.floor(toNumber(process.env.SCORE_BATCH_CONCURRENCY) ?? 10),
  );

  return async function handleRequest(req, res) {
    const requestUrl = new URL(req.url || "/", "http://localhost");

    if (req.method === "GET" && requestUrl.pathname === "/health") {
      writeJson(res, 200, { ok: true, timestamp: nowIso() });
      return;
    }

    const scoreMatch = requestUrl.pathname.match(/^\/get-score\/([^/]+)\/?$/);
    if (scoreMatch) {
      await handleEventRequest({
        res,
        rawIds: decodeURIComponent(scoreMatch[1]),
        cache: scoreCache,
        maxBatchItems,
        batchConcurrency,
      });
      return;
    }

    const eventDataMatch = requestUrl.pathname.match(
      /^\/get-event-data\/([^/]+)\/?$/,
    );
    if (eventDataMatch) {
      await handleEventRequest({
        res,
        rawIds: decodeURIComponent(eventDataMatch[1]),
        cache: eventDataCache,
        maxBatchItems,
        batchConcurrency,
      });
      return;
    }

    writeJson(res, 404, {
      error: "Route not found",
      expected: "/get-score/:eventId or /get-event-data/:eventId",
    });
  };
}

async function startServer() {
  await loadDotEnv(".env");
  await loadDotEnv(path.join(__dirname, ".env"));

  const redisUrl = await getRedisUrl();
  if (!redisUrl) {
    throw new Error(
      "Missing Redis URL. Set SKY_REDIS_URL/REDIS_URL or sky_redis_url.txt",
    );
  }

  const redis = new RedisClient(redisUrl);
  await redis.connect();
  const scoreCache = createScoreCache(redis, {
    cacheTtlMs: process.env.SCORE_CACHE_TTL_MS,
    missTtlMs: process.env.SCORE_CACHE_MISS_TTL_MS,
    maxEntries: process.env.SCORE_CACHE_MAX_ENTRIES,
  });
  const eventDataCache = createEventDataCache(redis, {
    cacheTtlMs:
      process.env.EVENT_DATA_CACHE_TTL_MS || process.env.SCORE_CACHE_TTL_MS,
    missTtlMs:
      process.env.EVENT_DATA_CACHE_MISS_TTL_MS ||
      process.env.SCORE_CACHE_MISS_TTL_MS,
    maxEntries:
      process.env.EVENT_DATA_CACHE_MAX_ENTRIES ||
      process.env.SCORE_CACHE_MAX_ENTRIES,
  });
  const requestHandler = createRequestHandler(scoreCache, eventDataCache);

  const host = process.env.SCORE_SERVER_HOST || "0.0.0.0";
  const port = Number(process.env.SCORE_SERVER_PORT || process.env.PORT || 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port: ${JSON.stringify(process.env.SCORE_SERVER_PORT || process.env.PORT)}`);
  }

  const server = http.createServer((req, res) => {
    requestHandler(req, res).catch((err) => {
      writeJson(res, 500, {
        error: "Unhandled server error",
        detail: formatError(err),
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  process.stdout.write(
    `[${nowIso()}] score-server.started host=${host} port=${port}\n`,
  );

  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    process.stderr.write(formatError(err) + "\n");
    process.exitCode = 1;
  });
}

module.exports = {
  createEventCache,
  createEventDataCache,
  createScoreCache,
  createRequestHandler,
  createResponseEnvelope,
  handleEventRequest,
  loadEventDataEnvelope,
  loadScoreEnvelope,
  normalizeCricketScore,
  normalizeScorePayload,
  normalizeSoccerScore,
  normalizeTennisScore,
  normalizeTennisStateScore,
  startServer,
};
