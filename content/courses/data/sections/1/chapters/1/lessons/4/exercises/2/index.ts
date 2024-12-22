import { appleFlashCard } from "@/content/courses/items/flashcard/apple";
import { waterFlashCard } from "@/content/courses/items/flashcard/water";
import { needHelpTranslate } from "@/content/courses/items/translate/help-please";
import { iAmHungryTranslate } from "@/content/courses/items/translate/i-am-hungry";
import { sushiPleaseTranslate } from "@/content/courses/items/translate/sushi-please";
import { ExerciseSet } from "@/types/course";


export const exerciseTwo: ExerciseSet = {
  id: 2,
  xp: 10,
  difficulty: "easy",
  items: [needHelpTranslate, appleFlashCard],
};
