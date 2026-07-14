// Per-user starter data, copied in at signup (there is no global library:
// every exercise/category row belongs to a user). The first-ever account
// instead adopts all pre-multi-user rows — see routes/auth.js — and only
// gets these seeds if that adoption found nothing.

export const DEFAULT_CATEGORIES = ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'];

const EXERCISES = [
  // Chest
  { name: 'Barbell Bench Press', muscle_group: 'chest' },
  { name: 'Incline Barbell Bench Press', muscle_group: 'chest' },
  { name: 'Dumbbell Bench Press', muscle_group: 'chest' },
  { name: 'Incline Dumbbell Press', muscle_group: 'chest' },
  { name: 'Dumbbell Flyes', muscle_group: 'chest' },
  { name: 'Cable Crossover', muscle_group: 'chest' },
  { name: 'Dips (Chest)', muscle_group: 'chest' },
  { name: 'Push-Up', muscle_group: 'chest' },
  { name: 'Machine Chest Press', muscle_group: 'chest' },
  { name: 'Pec Deck', muscle_group: 'chest' },
  { name: 'Decline Bench Press', muscle_group: 'chest' },

  // Back
  { name: 'Barbell Row', muscle_group: 'back' },
  { name: 'Pull-Up', muscle_group: 'back' },
  { name: 'Chin-Up', muscle_group: 'back' },
  { name: 'Lat Pulldown', muscle_group: 'back' },
  { name: 'Seated Cable Row', muscle_group: 'back' },
  { name: 'Dumbbell Row', muscle_group: 'back' },
  { name: 'T-Bar Row', muscle_group: 'back' },
  { name: 'Face Pull', muscle_group: 'back' },
  { name: 'Chest-Supported Row', muscle_group: 'back' },
  { name: 'Straight-Arm Pulldown', muscle_group: 'back' },
  { name: 'Back Extension', muscle_group: 'back' },
  { name: 'Shrug', muscle_group: 'back' },

  // Legs
  { name: 'Barbell Squat', muscle_group: 'legs' },
  { name: 'Front Squat', muscle_group: 'legs' },
  { name: 'Deadlift', muscle_group: 'legs' },
  { name: 'Romanian Deadlift', muscle_group: 'legs' },
  { name: 'Leg Press', muscle_group: 'legs' },
  { name: 'Leg Curl', muscle_group: 'legs' },
  { name: 'Leg Extension', muscle_group: 'legs' },
  { name: 'Bulgarian Split Squat', muscle_group: 'legs' },
  { name: 'Calf Raise', muscle_group: 'legs' },
  { name: 'Hip Thrust', muscle_group: 'legs' },
  { name: 'Walking Lunge', muscle_group: 'legs' },
  { name: 'Goblet Squat', muscle_group: 'legs' },
  { name: 'Hack Squat', muscle_group: 'legs' },
  { name: 'Seated Calf Raise', muscle_group: 'legs' },

  // Shoulders
  { name: 'Overhead Press', muscle_group: 'shoulders' },
  { name: 'Dumbbell Shoulder Press', muscle_group: 'shoulders' },
  { name: 'Lateral Raise', muscle_group: 'shoulders' },
  { name: 'Front Raise', muscle_group: 'shoulders' },
  { name: 'Reverse Flyes', muscle_group: 'shoulders' },
  { name: 'Arnold Press', muscle_group: 'shoulders' },
  { name: 'Cable Lateral Raise', muscle_group: 'shoulders' },
  { name: 'Machine Shoulder Press', muscle_group: 'shoulders' },
  { name: 'Upright Row', muscle_group: 'shoulders' },

  // Arms
  { name: 'Barbell Curl', muscle_group: 'arms' },
  { name: 'Dumbbell Curl', muscle_group: 'arms' },
  { name: 'Hammer Curl', muscle_group: 'arms' },
  { name: 'Tricep Pushdown', muscle_group: 'arms' },
  { name: 'Overhead Tricep Extension', muscle_group: 'arms' },
  { name: 'Skull Crusher', muscle_group: 'arms' },
  { name: 'Dips (Tricep)', muscle_group: 'arms' },
  { name: 'Preacher Curl', muscle_group: 'arms' },
  { name: 'Concentration Curl', muscle_group: 'arms' },
  { name: 'Cable Curl', muscle_group: 'arms' },
  { name: 'Close-Grip Bench Press', muscle_group: 'arms' },
  { name: 'Tricep Kickback', muscle_group: 'arms' },

  // Core
  { name: 'Plank', muscle_group: 'core' },
  { name: 'Hanging Leg Raise', muscle_group: 'core' },
  { name: 'Cable Crunch', muscle_group: 'core' },
  { name: 'Ab Wheel Rollout', muscle_group: 'core' },
  { name: 'Crunch', muscle_group: 'core' },
  { name: 'Sit-Up', muscle_group: 'core' },
  { name: 'Russian Twist', muscle_group: 'core' },
  { name: 'Side Plank', muscle_group: 'core' },
  { name: 'Bicycle Crunch', muscle_group: 'core' },
  { name: 'Dead Bug', muscle_group: 'core' },
];

// Give a user the default categories, plus the seed exercise library if they
// have no exercises (i.e. they didn't adopt an existing one). Runs inside the
// caller's transaction.
export function seedUser(db, userId) {
  const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (user_id, name) VALUES (?, ?)');
  for (const name of DEFAULT_CATEGORIES) insertCategory.run(userId, name);

  const count = db.prepare('SELECT COUNT(*) AS n FROM exercises WHERE user_id = ?').get(userId).n;
  if (count > 0) return;

  const insert = db.prepare('INSERT INTO exercises (user_id, name, muscle_group, is_custom) VALUES (?, ?, ?, 0)');
  for (const ex of EXERCISES) insert.run(userId, ex.name, ex.muscle_group);
}
