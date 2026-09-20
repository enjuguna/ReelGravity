export type Movie = { id:number; title:string; year:number; runtime:number; genres:string[]; overview:string; posterPath?:string; mood:string[]; pace:string[]; theme:string[]; };
export type HardFilters = { runtimeMax?:number; runtimeMin?:number; yearMin?:number; yearMax?:number; genre?:string; };
export type MovieEvaluation = { movieId:number; overall:number; mood:number; pace:number; theme:number; eligible:boolean; explanation?:string; };
export type SearchSession = { preferences:string[]; secondPreferences:string[]; mode:"solo"|"duo"; filters:HardFilters; evaluations:Record<number,MovieEvaluation>; shortlistedIds:number[]; pinnedIds:number[]; dismissedIds:number[]; };
export type MoodSnapshot = { v:1; preferences:string[]; secondPreferences:string[]; mode:"solo"|"duo"; filters:HardFilters; shortlistedIds:number[]; pinnedIds:number[]; dismissedIds:number[]; };
