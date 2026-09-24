export type TypeActe = "naissance" | "mariage" | "deces" | "table_decennale";

export interface RechercheRegistreQuery {
  commune: string;
  typeActe?: TypeActe;
  anneeDebut?: number;
  anneeFin?: number;
}

export interface RegistreTrouve {
  departement: string;
  commune: string;
  titre: string;
  /** Libellés bruts des types d'actes tels qu'indiqués par la source (un registre peut en couvrir plusieurs, ex. baptêmes+mariages+sépultures). */
  typesActes: string[];
  anneeDebut: number;
  anneeFin: number;
  cote?: string;
  lieu?: string;
  url: string;
}
