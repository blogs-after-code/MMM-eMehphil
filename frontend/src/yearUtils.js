// Mirrors backend/src/utils/yearUtils.js — same logic, client-side,
// just so the UI can display/use "your year" without an extra API call.

export function getAdmissionYear(rollNumber) {
  return parseInt(rollNumber.slice(0, 4), 10);
}

export function getCurrentAcademicYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

export function getYearOfStudy(rollNumber) {
  const admissionYear = getAdmissionYear(rollNumber);
  const currentAcademicYear = getCurrentAcademicYear();
  return currentAcademicYear - admissionYear + 1;
}
