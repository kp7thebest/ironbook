import { uid } from "./helpers.js";

// ============ CONSTANTS ============
export const KG_PER_LB = 0.45359237;
export const IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
export const COMMON_DAYS = ["push", "pull", "legs", "upper", "lower", "full body", "chest day", "back day", "leg day", "arms day", "shoulders day"];
export const THEME_KEY = "ironbook:theme";
export const draftKey = (uid) => `ironbook:draft:${uid}`;
export const queueKey = (uid) => `ironbook:queue:${uid}`;
export const CACHE_PREFIX = "ironbook:cache:";
export const cacheKey = (uid) => CACHE_PREFIX + uid; // last-known profile/customs/workouts (instant launch)

// Muscle -> region + competition-plate color
export const MUSCLE_META = {
  quadriceps: ["Legs", "#D64545"], hamstrings: ["Legs", "#D64545"], glutes: ["Legs", "#D64545"],
  calves: ["Legs", "#D64545"], adductors: ["Legs", "#D64545"], abductors: ["Legs", "#D64545"],
  chest: ["Chest", "#3B6FD6"],
  lats: ["Back", "#3F9E62"], "middle back": ["Back", "#3F9E62"], "lower back": ["Back", "#3F9E62"], traps: ["Back", "#3F9E62"],
  shoulders: ["Shoulders", "#E8C547"],
  biceps: ["Arms", "#C9CDD4"], triceps: ["Arms", "#C9CDD4"], forearms: ["Arms", "#C9CDD4"],
  abdominals: ["Core", "#8A8F98"], neck: ["Other", "#8A8F98"], other: ["Other", "#8A8F98"],
};
export const muscleColor = (m) => (MUSCLE_META[m] || MUSCLE_META.other)[1];
export const muscleRegion = (m) => (MUSCLE_META[m] || MUSCLE_META.other)[0];
