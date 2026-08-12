// MMMUT roll numbers start with the 4-digit admission year, e.g. "2025071129".
// This derives which academic year a student is currently in, based on today's date.
// Assumes a new academic year starts around July (typical Indian university calendar).

export function getAdmissionYear(rollNumber) {
  return parseInt(rollNumber.slice(0, 4), 10);
}

export function getCurrentAcademicYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  // If it's before July, the academic year hasn't rolled over yet this calendar year.
  return month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

// Returns 1 for first year, 2 for second year, etc.
export function getYearOfStudy(rollNumber) {
  const admissionYear = getAdmissionYear(rollNumber);
  const currentAcademicYear = getCurrentAcademicYear();
  return currentAcademicYear - admissionYear + 1;
}
