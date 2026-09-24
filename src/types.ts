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
  typeActe: TypeActe | "inconnu";
  anneeDebut: number;
  anneeFin: number;
  cote?: string;
  url: string;
  description?: string;
}
