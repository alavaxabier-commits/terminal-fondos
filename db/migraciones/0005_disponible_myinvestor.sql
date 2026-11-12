-- Disponibilidad en MyInvestor: se marca a mano al pasar un fondo a candidato (null = sin comprobar).
alter table fondos.seguimiento add column disponible_myinvestor boolean;
