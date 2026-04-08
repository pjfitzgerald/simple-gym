const EXERCISES = [
  // Chest
  { name: 'Barbell Bench Press', muscle_group: 'chest' },
  { name: 'Incline Barbell Bench Press', muscle_group: 'chest' },
  { name: 'Dumbbell Bench Press', muscle_group: 'chest' },
  { name: 'Incline Dumbbell Press', muscle_group: 'chest' },
  { name: 'Dumbbell Flyes', muscle_group: 'chest' },
  { name: 'Cable Crossover', muscle_group: 'chest' },
  { name: 'Dips (Chest)', muscle_group: 'chest' },

  // Back
  { name: 'Barbell Row', muscle_group: 'back' },
  { name: 'Pull-Up', muscle_group: 'back' },
  { name: 'Chin-Up', muscle_group: 'back' },
  { name: 'Lat Pulldown', muscle_group: 'back' },
  { name: 'Seated Cable Row', muscle_group: 'back' },
  { name: 'Dumbbell Row', muscle_group: 'back' },
  { name: 'T-Bar Row', muscle_group: 'back' },
  { name: 'Face Pull', muscle_group: 'back' },

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

  // Shoulders
  { name: 'Overhead Press', muscle_group: 'shoulders' },
  { name: 'Dumbbell Shoulder Press', muscle_group: 'shoulders' },
  { name: 'Lateral Raise', muscle_group: 'shoulders' },
  { name: 'Front Raise', muscle_group: 'shoulders' },
  { name: 'Reverse Flyes', muscle_group: 'shoulders' },
  { name: 'Arnold Press', muscle_group: 'shoulders' },

  // Arms
  { name: 'Barbell Curl', muscle_group: 'arms' },
  { name: 'Dumbbell Curl', muscle_group: 'arms' },
  { name: 'Hammer Curl', muscle_group: 'arms' },
  { name: 'Tricep Pushdown', muscle_group: 'arms' },
  { name: 'Overhead Tricep Extension', muscle_group: 'arms' },
  { name: 'Skull Crusher', muscle_group: 'arms' },
  { name: 'Dips (Tricep)', muscle_group: 'arms' },

  // Core
  { name: 'Plank', muscle_group: 'core' },
  { name: 'Hanging Leg Raise', muscle_group: 'core' },
  { name: 'Cable Crunch', muscle_group: 'core' },
  { name: 'Ab Wheel Rollout', muscle_group: 'core' },
];

export function seed(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM exercises WHERE is_custom = 0').get().count;
  if (count > 0) return; // Already seeded

  const insert = db.prepare('INSERT INTO exercises (name, muscle_group, is_custom) VALUES (?, ?, 0)');
  const insertMany = db.transaction((exercises) => {
    for (const ex of exercises) {
      insert.run(ex.name, ex.muscle_group);
    }
  });

  insertMany(EXERCISES);
  console.log(`Seeded ${EXERCISES.length} exercises`);
}
