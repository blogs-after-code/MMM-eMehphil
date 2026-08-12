// In-memory matchmaking pool. Fine for a single server instance;
// if this ever runs on multiple instances, this needs to move to Redis.

// Queue of { rollNumber, year, filterYear } waiting to be matched, in arrival order.
// filterYear is null for "match with anyone", or a specific year number to restrict to.
const waitingQueue = [];

// rollNumber -> { partnerRollNumber, roomId }
const activeMatches = new Map();

export function addToQueue(rollNumber, year, filterYear = null) {
  removeFromQueue(rollNumber); // avoid duplicate entries
  waitingQueue.push({ rollNumber, year, filterYear });
}

export function removeFromQueue(rollNumber) {
  const idx = waitingQueue.findIndex((entry) => entry.rollNumber === rollNumber);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

// Two waiting users are compatible if each one's filter (if set) accepts the other's year.
function isCompatible(a, b) {
  const aAccepts = a.filterYear === null || a.filterYear === b.year;
  const bAccepts = b.filterYear === null || b.filterYear === a.year;
  return aAccepts && bAccepts;
}

// Scans the queue for the first compatible pair, prioritizing whoever has
// been waiting longest. Returns { userA, userB, roomId } or null.
export function tryMatch() {
  for (let i = 0; i < waitingQueue.length; i++) {
    for (let j = i + 1; j < waitingQueue.length; j++) {
      if (isCompatible(waitingQueue[i], waitingQueue[j])) {
        const [entryA] = waitingQueue.splice(j, 1); // remove later index first
        const [entryB] = waitingQueue.splice(i, 1);
        const roomId = `room_${entryB.rollNumber}_${entryA.rollNumber}_${Date.now()}`;

        activeMatches.set(entryB.rollNumber, { partnerRollNumber: entryA.rollNumber, roomId });
        activeMatches.set(entryA.rollNumber, { partnerRollNumber: entryB.rollNumber, roomId });

        return { userA: entryB.rollNumber, userB: entryA.rollNumber, roomId };
      }
    }
  }
  return null;
}

export function getMatch(rollNumber) {
  return activeMatches.get(rollNumber) || null;
}

export function endMatch(rollNumber) {
  const match = activeMatches.get(rollNumber);
  if (!match) return null;

  activeMatches.delete(rollNumber);
  activeMatches.delete(match.partnerRollNumber);
  return match; // caller needs partnerRollNumber + roomId to notify the other user
}

