import type { RecipeEntity } from '../domain/recipe';

export interface RecipesRepository {
  get(code: string): Promise<RecipeEntity | undefined>;
  list(): Promise<RecipeEntity[]>;
  put(recipe: RecipeEntity): Promise<void>;
  putMany(recipes: readonly RecipeEntity[]): Promise<void>;
  delete(code: string): Promise<void>;
}
