import { bulkPut, type AppDb } from '@/shared/infrastructure/db';
import type { RecipesRepository } from '../application/ports';
import type { RecipeEntity } from '../domain/recipe';

export class IdbRecipesRepository implements RecipesRepository {
  constructor(private readonly db: AppDb) {}

  get(code: string): Promise<RecipeEntity | undefined> {
    return this.db.get('recipes', code);
  }

  list(): Promise<RecipeEntity[]> {
    return this.db.getAll('recipes');
  }

  async put(recipe: RecipeEntity): Promise<void> {
    await this.db.put('recipes', recipe);
  }

  putMany(recipes: readonly RecipeEntity[]): Promise<void> {
    return bulkPut(this.db, 'recipes', recipes);
  }

  delete(code: string): Promise<void> {
    return this.db.delete('recipes', code);
  }
}
