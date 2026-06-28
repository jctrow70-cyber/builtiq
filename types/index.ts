export type WorkoutDay = {
  title: string;
  focus: string;
  duration: string;
  blocks: string[];
};

export type MacroEntry = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};
